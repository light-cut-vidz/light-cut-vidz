// ── Language toggle ──────────────────────────────────────────────────────────

let lang = localStorage.getItem('lc-lang') || 'fr'

function applyLang() {
  document.documentElement.lang = lang
  document.querySelectorAll('[data-fr][data-en]').forEach(el => {
    el.textContent = el.dataset[lang]
  })
  document.getElementById('langToggle').textContent = lang === 'fr' ? 'EN' : 'FR'

  // Meta description
  const desc = document.querySelector('meta[name="description"]')
  if (desc) {
    desc.content = lang === 'fr'
      ? 'LightCutVidz est un éditeur vidéo desktop léger et gratuit pour macOS et Linux. FFmpeg intégré, aucune dépendance externe.'
      : 'LightCutVidz is a lightweight free desktop video editor for macOS and Linux. Bundled FFmpeg, no external dependencies.'
  }
  document.title = lang === 'fr'
    ? 'LightCutVidz — Éditeur vidéo léger'
    : 'LightCutVidz — Lightweight video editor'
}

document.getElementById('langToggle').addEventListener('click', () => {
  lang = lang === 'fr' ? 'en' : 'fr'
  localStorage.setItem('lc-lang', lang)
  applyLang()
})

applyLang()

// ── Copy install commands ─────────────────────────────────────────────────────

document.querySelectorAll('.copy-btn').forEach(btn => {
  const cmdEl = btn.closest('.installer-cmd').querySelector('.copy-target')
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(cmdEl.textContent.trim())
      btn.classList.add('copied')
      setTimeout(() => btn.classList.remove('copied'), 2000)
    } catch {
      const range = document.createRange()
      range.selectNode(cmdEl)
      window.getSelection().removeAllRanges()
      window.getSelection().addRange(range)
    }
  })
})

// ── Smooth nav highlight ──────────────────────────────────────────────────────

const sections = document.querySelectorAll('section[id]')
const navLinks = document.querySelectorAll('.nav-links a[href^="#"]')

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      navLinks.forEach(a => {
        a.style.color = a.getAttribute('href') === '#' + entry.target.id
          ? 'var(--text)'
          : ''
      })
    }
  })
}, { threshold: 0.4 })

sections.forEach(s => observer.observe(s))
