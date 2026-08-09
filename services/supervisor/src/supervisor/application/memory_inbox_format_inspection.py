"""Bounded, private format validation for quarantined Memory Inbox uploads.

This module does not scan content or make a Source actionable.  It only
establishes that a quarantined byte stream matches its declared accepted format
without extracting any user-controlled material to a web-visible location.
"""

from dataclasses import dataclass
from io import BytesIO
from pathlib import PurePosixPath
import zipfile


ALLOWED_MEDIA_TYPES = frozenset({
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
})
MAX_DOCX_MEMBERS = 512
MAX_DOCX_UNCOMPRESSED_BYTES = 16 * 1024 * 1024


@dataclass(frozen=True)
class FormatInspectionResult:
    valid: bool
    inspected_media_type: str | None
    reason_code: str


def validate_quarantined_format(*, declared_media_type: str, content: bytes) -> FormatInspectionResult:
    """Validate a declared accepted type without creating an extracted copy.

    A valid result is intentionally insufficient to issue ``safe-to-act``.
    The caller must additionally obtain a successful, version-bound malware
    scan and pass the result fence before moving the Source to Unprocessed.
    """

    if declared_media_type not in ALLOWED_MEDIA_TYPES:
        return FormatInspectionResult(False, None, "declared_type_not_allowed")
    if not content:
        return FormatInspectionResult(False, None, "empty_quarantine_object")
    if declared_media_type == "application/pdf":
        return _validate_pdf(content)
    if declared_media_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return _validate_docx(content)
    return _validate_text(declared_media_type, content)


def _validate_pdf(content: bytes) -> FormatInspectionResult:
    # PDF producers may prefix a binary-comment before later content, but the
    # signature itself must be at offset zero for this conservative release.
    if not content.startswith(b"%PDF-"):
        return FormatInspectionResult(False, None, "inspected_type_mismatch")
    return FormatInspectionResult(True, "application/pdf", "format_valid")


def _validate_docx(content: bytes) -> FormatInspectionResult:
    if not content.startswith(b"PK\x03\x04"):
        return FormatInspectionResult(False, None, "inspected_type_mismatch")
    try:
        with zipfile.ZipFile(BytesIO(content)) as archive:
            members = archive.infolist()
            if len(members) > MAX_DOCX_MEMBERS:
                return FormatInspectionResult(False, None, "archive_member_limit_exceeded")
            if sum(member.file_size for member in members) > MAX_DOCX_UNCOMPRESSED_BYTES:
                return FormatInspectionResult(False, None, "archive_size_limit_exceeded")
            names = {member.filename for member in members}
            if "[Content_Types].xml" not in names or "word/document.xml" not in names:
                return FormatInspectionResult(False, None, "inspected_type_mismatch")
            for member in members:
                path = PurePosixPath(member.filename)
                if member.is_dir() or path.is_absolute() or ".." in path.parts or "\x00" in member.filename:
                    return FormatInspectionResult(False, None, "unsafe_archive_member")
    except (OSError, zipfile.BadZipFile, zipfile.LargeZipFile):
        return FormatInspectionResult(False, None, "inspected_type_mismatch")
    return FormatInspectionResult(
        True,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "format_valid",
    )


def _validate_text(declared_media_type: str, content: bytes) -> FormatInspectionResult:
    try:
        decoded = content.decode("utf-8", errors="strict")
    except UnicodeDecodeError:
        return FormatInspectionResult(False, None, "inspected_type_mismatch")
    if "\x00" in decoded:
        return FormatInspectionResult(False, None, "unsafe_text_content")
    # Plain text and Markdown are both UTF-8 text at this layer.  The declared
    # type remains part of the durable manifest and must be scanner-approved.
    return FormatInspectionResult(True, declared_media_type, "format_valid")
