import { CatalogueInventoryView } from './CatalogueInventoryView.jsx'

export function WallTexture({ externalSearch, onSearchChange, onStatsUpdated }) {
  return (
    <CatalogueInventoryView
      slug="WALL_TEXTURE"
      title="Wall Texture Catalogue Inventory"
      externalSearch={externalSearch}
      onSearchChange={onSearchChange}
      onStatsUpdated={onStatsUpdated}
    />
  )
}
