import { CatalogueInventoryView } from './CatalogueInventoryView.jsx'

export function RoyalTexture({ externalSearch, onSearchChange, onStatsUpdated }) {
  return (
    <CatalogueInventoryView
      slug="ROYAL_TEXTURE"
      title="Royal Texture Catalogue Inventory"
      externalSearch={externalSearch}
      onSearchChange={onSearchChange}
      onStatsUpdated={onStatsUpdated}
    />
  )
}
