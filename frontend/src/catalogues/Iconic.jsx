import { CatalogueInventoryView } from './CatalogueInventoryView.jsx'

export function Iconic({ externalSearch, onSearchChange, onStatsUpdated }) {
  return (
    <CatalogueInventoryView
      slug="ICONIC"
      title="Iconic Catalogue Inventory"
      externalSearch={externalSearch}
      onSearchChange={onSearchChange}
      onStatsUpdated={onStatsUpdated}
    />
  )
}
