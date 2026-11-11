import { useState, useEffect, useCallback } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { CatalogueCard } from '../components/CatalogueCard.jsx'
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
import { CatalogueGridSkeleton } from '../components/Skeleton.jsx'
import '../styles/AddProducts.css'

export function AddProducts() {
  const { slug } = useParams()
  const navigate = useNavigate()

  const [catalogues, setCatalogues] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState('')

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

  const handleCreateCatalogue = async (e) => {
    e.preventDefault()
    if (creating) return
    setFormError('')

    const cleanName = newName.trim().toUpperCase()
    if (!cleanName) {
      setFormError('Catalogue name is required')
      return
    }

    setCreating(true)
    try {
      await catalogueService.createCatalogue({
        name: cleanName,
        slug: cleanName.replace(/\s+/g, '_'),
        description: newDesc.trim(),
      })
      setNewName('')
      setNewDesc('')
      setShowNewModal(false)
      await loadCatalogues(true)
    } catch (err) {
      setFormError(
        err.response?.data?.message || 'Unable to create catalogue.'
      )
    } finally {
      setCreating(false)
    }
  }

  const renderCatalogueEditor = () => {
    if (!selectedSlug) return null
    if (selectedSlug === 'SOHO') {
      return (
        <SOHO
          onStatsUpdated={() => loadCatalogues(true)}
        />
      )
    }
    if (selectedSlug === 'SELFIE_POINT' || selectedSlug === 'SELFIE POINT') {
      return (
        <SelfiePoint
          onStatsUpdated={() => loadCatalogues(true)}
        />
      )
    }
    if (selectedSlug === 'ROYAL_TEXTURE' || selectedSlug === 'ROYAL TEXTURE') {
      return (
        <RoyalTexture
          onStatsUpdated={() => loadCatalogues(true)}
        />
      )
    }
    if (selectedSlug === 'ICONIC') {
      return (
        <Iconic
          onStatsUpdated={() => loadCatalogues(true)}
        />
      )
    }
    if (selectedSlug === 'EW') {
      return (
        <EW
          onStatsUpdated={() => loadCatalogues(true)}
        />
      )
    }
    return (
      <CatalogueInventoryView
        slug={selectedSlug}
        title={`${selectedSlug} Inventory Management`}
        onStatsUpdated={() => loadCatalogues(true)}
      />
    )
  }

  return (
    <div className="add-products-page">
      <nav className="crm-breadcrumb" aria-label="Breadcrumb">
        <Link to="/dashboard" className="breadcrumb-link">
          Home
        </Link>
        <span className="breadcrumb-sep">&gt;</span>
        {selectedSlug ? (
          <>
            <Link to="/add-products" className="breadcrumb-link">
              Add Products
            </Link>
            <span className="breadcrumb-sep">&gt;</span>
            <span className="breadcrumb-current">
              {formatCatalogueLabel(selectedSlug)}
            </span>
          </>
        ) : (
          <span className="breadcrumb-current">Add Products</span>
        )}
      </nav>

      <div className="add-products-header">
        <div>
          <h1 className="add-products-heading">
            {selectedSlug
              ? `${formatCatalogueLabel(selectedSlug)} – Inventory Management`
              : 'Add Products & Stock Management'}
          </h1>
          <p className="add-products-subtext">
            Select a catalogue card to manage pattern quantities or add new catalogues
          </p>
        </div>

        <div className="add-products-actions">
          {selectedSlug && (
            <button
              type="button"
              className="btn-secondary-outline"
              onClick={() => navigate('/add-products')}
            >
              ← Back to All Catalogues
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ marginTop: '12px' }}>
          <CatalogueGridSkeleton count={6} />
        </div>
      ) : selectedSlug ? (
        renderCatalogueEditor()
      ) : (
        <div className="add-products-cards-grid">
          {catalogues.map((cat) => (
            <CatalogueCard
              key={cat._id || cat.slug}
              catalogue={cat}
              onSelect={(targetSlug) =>
                navigate(`/add-products/${targetSlug.toUpperCase()}`)
              }
              buttonLabel="View Catalogue"
            />
          ))}
        </div>
      )}

      {showNewModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowNewModal(false)}
        >
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="modal-title">Create New Catalogue</h3>
            {formError && <p className="modal-error">{formError}</p>}
            <form onSubmit={handleCreateCatalogue} className="modal-form">
              <div className="modal-field">
                <label>Catalogue Name / Code</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. ROYAL, APEX"
                  required
                  autoFocus
                />
              </div>
              <div className="modal-field">
                <label>Description (Optional)</label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Collection description"
                />
              </div>
              <div className="modal-btn-row">
                <button
                  type="button"
                  className="btn-secondary-outline"
                  onClick={() => setShowNewModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="btn-primary-dark"
                >
                  {creating ? 'Creating...' : 'Create Catalogue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
