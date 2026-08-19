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

/** Le formateur HTML peut replier une commande longue sur deux lignes ; un
 * textContent brut recopierait alors le retour à la ligne et l'indentation dans le
 * presse-papiers. On aplatit toute suite d'espaces. */
function commandText(el) {
  return el.textContent.replace(/\s+/g, ' ').trim()
}

// ── Copy install commands ─────────────────────────────────────────────────────

document.querySelectorAll('.copy-btn').forEach(btn => {
  // Un bouton sans conteneur reconnu renverrait null ici, et l'exception tuerait
  // tout le script — donc aussi la copie des autres commandes.
  const cmdEl = btn.closest('.installer-cmd, .install-hero-cmd')?.querySelector('.copy-target')
  if (!cmdEl) return
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(commandText(cmdEl))
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
