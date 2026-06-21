interface ContractProposalParty {
  entity_id?: string | null;
  _resolvedEntityId?: string | null;
  _resolvedClientId?: string | null;
}

export const resolveContractPartyFromProposal = (proposal: ContractProposalParty) => {
  const entityId = proposal.entity_id || proposal._resolvedEntityId || null;
  if (!entityId) throw new Error("Contact not found.");

  return {
    entityId,
    clientId: proposal._resolvedClientId || null,
  };
};
