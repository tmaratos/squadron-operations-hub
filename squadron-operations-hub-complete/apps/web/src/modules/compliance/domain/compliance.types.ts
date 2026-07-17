export interface ComplianceRequirement {
  id: string;
  squadronId: string;
  name: string;
  governingSource?: string;
  responsibleRole?: string;
  recurrenceRule?: string;
  requiredEvidence?: string[];
  approvalAuthority?: string;
  isActive: boolean;
}
