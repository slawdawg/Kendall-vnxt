export function createManagerProofStore() {
  return {
    candidatesByDedupe: new Map(),
    workItems: new Map(),
    leases: new Map(),
    attempts: new Map(),
    evidenceRecords: new Map(),
    events: []
  };
}
