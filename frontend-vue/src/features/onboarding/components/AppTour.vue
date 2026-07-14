<template>
  <div class="tour-orchestrator hidden">
    <!-- Orchestrator logic lives in script -->
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useOnboardingStore } from '../store/onboarding'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import confetti from 'canvas-confetti'
import { useRoute } from 'vue-router'

const store = useOnboardingStore()
const route = useRoute()

let driverObj: any = null

onMounted(async () => {
  if (!store.hasFetched) {
    await store.fetchProgress()
  }
  evaluateTourState()
})

// Evaluar la ruta cuando cambie, con un pequeño delay para que monte la vista
watch(() => route.path, () => {
  setTimeout(() => {
    evaluateTourState()
  }, 400)
})

// Celebrar cuando progresen y reevaluar estado
watch(() => store.progressPercentage, (newVal, oldVal) => {
  if (newVal > oldVal && newVal < 100) {
    fireMiniConfetti()
  } else if (newVal === 100 && oldVal < 100) {
    fireGrandConfetti()
  }
  
  // Re-evaluar el tour luego de la acción
  setTimeout(() => {
    evaluateTourState()
  }, 400)
})

function getMenuIdForStep(stepId: string) {
  if (stepId === 'load_demo_or_create_cycle' || stepId === 'setup_syllabus') return 'menu-academics'
  if (stepId === 'create_pdf_template') return 'menu-config'
  if (stepId === 'generate_material') return 'menu-operations'
  return null
}

function openMenuForStep(stepId: string) {
  const menuId = getMenuIdForStep(stepId)
  if (menuId) {
    const btn = document.getElementById(menuId)
    if (btn && btn.getAttribute('aria-expanded') === 'false') {
      btn.click()
    }
  }
}

function evaluateTourState() {
  if (store.isDismissed || store.isComplete) {
    if (driverObj) {
      driverObj.destroy()
      driverObj = null
    }
    return
  }

  const nextStep = store.availableSteps.find(s => !s.completed)
  if (!nextStep) return

  if (driverObj) {
    driverObj.destroy()
  }

  openMenuForStep(nextStep.id)

  let steps = []
  
  if (nextStep.id === 'load_demo_or_create_cycle') {
    if (route.path !== '/academic-time') {
      steps = [{
        element: 'a[href="/academic-time"]',
        popover: {
          title: 'Paso 1: Ciclos Académicos 📅',
          description: 'Ve a "Ciclos Académicos" para crear tu primer año escolar.',
          side: 'right',
          align: 'start'
        }
      }]
    } else {
      steps = [{
        element: '#tour-create-cycle',
        popover: {
          title: 'Crea tu Ciclo 🚀',
          description: 'Da clic aquí para establecer las fechas de tu primer ciclo.',
          side: 'bottom',
          align: 'center'
        }
      }]
    }
  } else if (nextStep.id === 'create_pdf_template') {
    if (route.path !== '/config') {
      steps = [{
        element: 'a[href="/config"]',
        popover: {
          title: 'Paso 2: Plantillas PDF 🎨',
          description: 'Es hora de darle estilo a tus materiales. Ve a Plantillas de Diseño.',
          side: 'right',
          align: 'start'
        }
      }]
    } else {
      steps = [{
        element: '#tour-create-template',
        popover: {
          title: 'Personaliza tu diseño ✨',
          description: 'Sube tu logo escolar y define el formato visual de tus exámenes.',
          side: 'bottom',
          align: 'center'
        }
      }]
    }
  } else if (nextStep.id === 'setup_syllabus') {
    if (route.path !== '/syllabus') {
      steps = [{
        element: 'a[href="/syllabus"]',
        popover: {
          title: 'Paso 3: Gestión de Sílabos 📚',
          description: '¡Casi listo! Ahora ve a Sílabos para configurar los temas.',
          side: 'right',
          align: 'start'
        }
      }]
    } else {
      steps = [{
        element: '#tour-create-syllabus',
        popover: {
          title: 'Planifica tus temas 📝',
          description: 'Da clic aquí para crear la currícula de tu primer curso.',
          side: 'bottom',
          align: 'center'
        }
      }]
    }
  } else if (nextStep.id === 'generate_material') {
    if (route.path !== '/materials') {
      steps = [{
        element: 'a[href="/materials"]',
        popover: {
          title: 'Paso Final: Generar Material 🪄',
          description: 'Ya tienes todo configurado. Ve al Monitor de Generación.',
          side: 'right',
          align: 'start'
        }
      }]
    } else {
      steps = [{
        element: '#tour-generate-material',
        popover: {
          title: '¡Que comience la magia! ⚡',
          description: 'Solicita tu primer balotario de preguntas automáticamente.',
          side: 'bottom',
          align: 'center'
        }
      }]
    }
  }

  if (steps.length > 0) {
    driverObj = driver({
      showProgress: false,
      doneBtnText: 'Entendido',
      closeBtnText: 'Ocultar',
      nextBtnText: 'Siguiente',
      prevBtnText: 'Anterior',
      allowClose: true,
      onDestroyStarted: () => {
        driverObj.destroy()
      },
      steps: steps
    })

    setTimeout(() => {
      driverObj.drive()
    }, 350)
  }
}

function fireMiniConfetti() {
  const duration = 2000;
  const end = Date.now() + duration;

  (function frame() {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors: ['#4f46e5', '#10b981', '#f59e0b']
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors: ['#4f46e5', '#10b981', '#f59e0b']
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  }());
}

function fireGrandConfetti() {
  const duration = 3000;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

  const interval: any = setInterval(function () {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      return clearInterval(interval);
    }

    const particleCount = 50 * (timeLeft / duration);
    confetti(Object.assign({}, defaults, { particleCount, origin: { x: Math.random(), y: Math.random() - 0.2 } }));
  }, 250);
}
</script>

<style>
@reference "@/assets/css/main.css";

.driver-popover {
  @apply bg-white dark:bg-[#2b2b3f] border border-slate-200 dark:border-slate-700/50 shadow-xl rounded-2xl p-5;
}
.driver-popover-title {
  @apply text-lg font-bold text-indigo-600 dark:text-indigo-400 mb-2;
}
.driver-popover-description {
  @apply text-sm text-slate-600 dark:text-slate-300;
}
.driver-popover-footer {
  @apply mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/50 flex justify-between items-center;
}
.driver-popover-progress-text {
  @apply text-xs font-bold text-slate-400;
}
.driver-popover-navigation-btns {
  @apply flex gap-2;
}
.driver-popover-next-btn,
.driver-popover-prev-btn,
.driver-popover-done-btn {
  @apply bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 font-bold px-3 py-1.5 rounded-lg transition-colors text-xs shadow-sm;
}
.driver-popover-close-btn {
  @apply absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300;
}
</style>
