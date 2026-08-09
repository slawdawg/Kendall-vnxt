from io import BytesIO
import zipfile

from supervisor.application.memory_inbox_format_inspection import validate_quarantined_format


def docx_bytes(*, unsafe_member: str | None = None) -> bytes:
    result = BytesIO()
    with zipfile.ZipFile(result, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types />")
        archive.writestr("word/document.xml", "<w:document />")
        if unsafe_member:
            archive.writestr(unsafe_member, "not extracted")
    return result.getvalue()


def test_accepts_a_declared_pdf_with_matching_signature_but_does_not_issue_safe_to_act() -> None:
    result = validate_quarantined_format(declared_media_type="application/pdf", content=b"%PDF-1.7\nprivate")

    assert result.valid
    assert result.inspected_media_type == "application/pdf"
    assert result.reason_code == "format_valid"


def test_rejects_a_declared_pdf_when_the_private_object_has_the_wrong_signature() -> None:
    result = validate_quarantined_format(declared_media_type="application/pdf", content=b"not a PDF")

    assert not result.valid
    assert result.reason_code == "inspected_type_mismatch"


def test_accepts_a_bounded_docx_container_without_extracting_it() -> None:
    result = validate_quarantined_format(
        declared_media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        content=docx_bytes(),
    )

    assert result.valid
    assert result.inspected_media_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def test_rejects_docx_with_an_archive_traversal_member() -> None:
    result = validate_quarantined_format(
        declared_media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        content=docx_bytes(unsafe_member="../outside.txt"),
    )

    assert not result.valid
    assert result.reason_code == "unsafe_archive_member"


def test_rejects_invalid_utf8_and_embedded_nuls_in_text_uploads() -> None:
    assert validate_quarantined_format(declared_media_type="text/plain", content=b"\xff").reason_code == "inspected_type_mismatch"
    assert validate_quarantined_format(declared_media_type="text/markdown", content=b"heading\x00").reason_code == "unsafe_text_content"
