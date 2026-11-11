import { useState, useEffect, useCallback } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { CatalogueCard } from '../components/CatalogueCard.jsx'
import { SearchBar } from '../components/SearchBar.jsx'
import { LottieIcon } from '../components/LottieIcon.jsx'
import { SOHO } from '../catalogues/SOHO.jsx'
import { EW } from '../catalogues/EW.jsx'
import { SelfiePoint } from '../catalogues/SelfiePoint.jsx'
import { RoyalTexture } from '../catalogues/RoyalTexture.jsx'
import { Iconic } from '../catalogues/Iconic.jsx'
import { CatalogueInventoryView } from '../catalogues/CatalogueInventoryView.jsx'
import {
  catalogueService,
  formatCatalogueLabel,
} from '../services/catalogueService.js'
import { CatalogueGridSkeleton, MetricsSkeleton } from '../components/Skeleton.jsx'
import '../styles/RollDetails.css'

export function RollDetails() {
  const { slug } = useParams()
  const navigate = useNavigate()

  const [catalogues, setCatalogues] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  const selectedSlug = slug ? slug.toUpperCase() : null

  const loadCatalogues = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await catalogueService.getAllCatalogues()
      setCatalogues(res.data?.data?.catalogues || [])
    } catch {
      // Handled gracefully
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCatalogues(false)
  }, [loadCatalogues])

  useEffect(() => {
    if (selectedSlug) return
    loadCatalogues(true)

    const eventSource = new EventSource('/api/inventory/stream', {
      withCredentials: true,
    })

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload.type === 'INVENTORY_UPDATED') {
          loadCatalogues(true)
        }
      } catch {
        // Ignore heartbeats
      }
    }

    return () => {
      eventSource.close()
    }
  }, [selectedSlug, loadCatalogues])

  const handleSelectCatalogue = (targetSlug, filter = null) => {
    setSearchQuery('')
    const searchParams = new URLSearchParams(location.search)
    const effectiveFilter = filter || searchParams.get('filter') || ''
    const query = effectiveFilter ? `?filter=${effectiveFilter}` : ''
    navigate(`/roll-details/${targetSlug.toUpperCase()}${query}`)
  }

  const filteredCatalogues = catalogues.filter((cat) => {
    const q = searchQuery.trim().toLowerCase()
    if (!q || selectedSlug) return true
    return (
      cat.name.toLowerCase().includes(q) ||
      cat.slug.toLowerCase().includes(q) ||
      (cat.description || '').toLowerCase().includes(q)
    )
  })

  const renderSelectedCatalogueComponent = () => {
    if (!selectedSlug) return null
    if (selectedSlug === 'SOHO') {
      return (
        <SOHO
          externalSearch={searchQuery}
          onSearchChange={setSearchQuery}
          onStatsUpdated={() => loadCatalogues(true)}
        />
      )
    }
    if (selectedSlug === 'SELFIE_POINT' || selectedSlug === 'SELFIE POINT') {
      return (
        <SelfiePoint
          externalSearch={searchQuery}
          onSearchChange={setSearchQuery}
          onStatsUpdated={() => loadCatalogues(true)}
        />
      )
    }
    if (selectedSlug === 'ROYAL_TEXTURE' || selectedSlug === 'ROYAL TEXTURE') {
      return (
        <RoyalTexture
          externalSearch={searchQuery}
          onSearchChange={setSearchQuery}
          onStatsUpdated={() => loadCatalogues(true)}
        />
      )
    }
    if (selectedSlug === 'ICONIC') {
      return (
        <Iconic
          externalSearch={searchQuery}
          onSearchChange={setSearchQuery}
          onStatsUpdated={() => loadCatalogues(true)}
        />
      )
    }
    if (selectedSlug === 'EW') {
      return (
        <EW
          externalSearch={searchQuery}
          onSearchChange={setSearchQuery}
          onStatsUpdated={() => loadCatalogues(true)}
        />
      )
    }
    return (
      <CatalogueInventoryView
        slug={selectedSlug}
        title={`${selectedSlug} Catalogue Inventory`}
        externalSearch={searchQuery}
        onSearchChange={setSearchQuery}
        onStatsUpdated={() => loadCatalogues(true)}
      />
    )
  }

  return (
    <div className="roll-details-page">
      {/* 1. Breadcrumb Navigation */}
      <nav className="crm-breadcrumb" aria-label="Breadcrumb">
        <Link to="/dashboard" className="breadcrumb-link">
          Home
        </Link>
        <span className="breadcrumb-sep">&gt;</span>
        {selectedSlug ? (
          <>
            <Link to="/roll-details" className="breadcrumb-link">
              Roll Details
            </Link>
            <span className="breadcrumb-sep">&gt;</span>
            <span className="breadcrumb-current">
              {formatCatalogueLabel(selectedSlug)}
            </span>
          </>
        ) : (
          <span className="breadcrumb-current">Roll Details</span>
        )}
      </nav>

      {/* Top Header & Quick Catalogue Switcher */}
      <div className="roll-details-topbar">
        <div>
          <h1 className="roll-details-heading">Roll Details</h1>
          <p className="roll-details-subtext">
            Select a catalogue to inspect patterns and manage roll stock
          </p>
        </div>

        <div className="catalogue-pill-tabs">
          <button
            type="button"
            className={`catalogue-pill-tab ${!selectedSlug ? 'active' : ''}`}
            onClick={() => navigate('/roll-details')}
          >
            All Catalogues
          </button>
          {catalogues.map((cat) => (
            <button
              key={cat.slug}
              type="button"
              className={`catalogue-pill-tab ${
                selectedSlug === cat.slug ? 'active' : ''
              }`}
              onClick={() => handleSelectCatalogue(cat.slug)}
            >
              {formatCatalogueLabel(cat.name)} ({cat.totalPatterns ?? 0})
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ marginTop: '12px' }}>
          <div style={{ height: '42px', width: '100%', background: '#f1f5f9', borderRadius: '10px', marginBottom: '24px' }} className="skeleton-shimmer" />
          <CatalogueGridSkeleton count={6} />
        </div>
      ) : selectedSlug ? (
        renderSelectedCatalogueComponent()
      ) : (
        <>
          <div className="roll-details-search-row">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search catalogue (e.g. Soho, Epic Wall, Selfie Point)..."
            />
          </div>

          <div className="roll-catalogue-cards-grid">
            {filteredCatalogues.map((cat) => (
              <CatalogueCard
                key={cat._id || cat.slug}
                catalogue={cat}
                isSelected={selectedSlug === cat.slug}
                onSelect={handleSelectCatalogue}
                buttonLabel={`Open ${formatCatalogueLabel(cat.name)} Inventory`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
