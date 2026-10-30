export function clearSelectedVenueSession(storage: Pick<Storage, "removeItem">) {
  storage.removeItem("atlas:selected-venue");
  storage.removeItem("atlas:selected-venues");
  storage.removeItem("atlas:selected-venue-suitability");
  storage.removeItem("atlas:selected-venue-suitabilities");
}

export function clearVenueDraftSession(storage: Pick<Storage, "removeItem">) {
  storage.removeItem("atlas:draft-plan");
}
