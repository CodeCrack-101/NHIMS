import { CatalogueInventoryView } from './CatalogueInventoryView.jsx'

export function EW({ externalSearch, onSearchChange, onStatsUpdated }) {
  return (
    <CatalogueInventoryView
      slug="EW"
      title="Epic Wall (EW) Catalogue Inventory"
      externalSearch={externalSearch}
      onSearchChange={onSearchChange}
      onStatsUpdated={onStatsUpdated}
    />
  )
}
