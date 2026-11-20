import { CatalogueInventoryView } from './CatalogueInventoryView.jsx'

export function Alpha({ externalSearch, onSearchChange, onStatsUpdated }) {
  return (
    <CatalogueInventoryView
      slug="ALPHA"
      title="Alpha Catalogue Inventory"
      externalSearch={externalSearch}
      onSearchChange={onSearchChange}
      onStatsUpdated={onStatsUpdated}
    />
  )
}
