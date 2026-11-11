import { CatalogueInventoryView } from './CatalogueInventoryView.jsx'

export function SOHO({ externalSearch, onSearchChange, onStatsUpdated }) {
  return (
    <CatalogueInventoryView
      slug="SOHO"
      title="Soho Catalogue Inventory"
      externalSearch={externalSearch}
      onSearchChange={onSearchChange}
      onStatsUpdated={onStatsUpdated}
    />
  )
}
