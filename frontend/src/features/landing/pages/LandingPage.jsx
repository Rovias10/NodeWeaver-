import { AmbientBackground } from '@/components/layout/AmbientBackground.jsx';
import { LandingNav } from '../components/LandingNav.jsx';
import { LandingFooter } from '../components/LandingFooter.jsx';
import { HeroSection } from '../sections/HeroSection.jsx';
import { FeaturesSection } from '../sections/FeaturesSection.jsx';
import { HowItWorksSection } from '../sections/HowItWorksSection.jsx';
import { CTASection } from '../sections/CTASection.jsx';

/**
 * Landing pública en /.
 *
 * Orquesta la nav, el fondo ambiental veraniego y las cuatro
 * secciones principales (hero, features, how-it-works, CTA) más el
 * footer académico.
 *
 * Esta página sustituye a la SetupOkPage de Fase 0 y al
 * SERVER/index.html antiguo. Ya no hay rastro de 'automatización'
 * ni 'NodeWeaver' en el copy.
 */
export function LandingPage() {
  return (
    <>
      <AmbientBackground />
      <LandingNav />
      <main className="relative">
        <HeroSection />
        <FeaturesSection />
        <HowItWorksSection />
        <CTASection />
      </main>
      <LandingFooter />
    </>
  );
}
