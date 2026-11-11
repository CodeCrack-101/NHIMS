import { CatalogueInventoryView } from './CatalogueInventoryView.jsx'

export function SelfiePoint({ externalSearch, onSearchChange, onStatsUpdated }) {
  return (
    <CatalogueInventoryView
      slug="SELFIE_POINT"
      title="Selfie Point Catalogue Inventory"
      externalSearch={externalSearch}
      onSearchChange={onSearchChange}
      onStatsUpdated={onStatsUpdated}
    />
  )
}
