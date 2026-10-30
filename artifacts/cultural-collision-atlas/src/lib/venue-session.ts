export function clearSelectedVenueSession(storage: Pick<Storage, "removeItem">) {
  storage.removeItem("atlas:selected-venue");
  storage.removeItem("atlas:selected-venue-suitability");
}

export function clearVenueDraftSession(storage: Pick<Storage, "removeItem">) {
  storage.removeItem("atlas:draft-plan");
}
