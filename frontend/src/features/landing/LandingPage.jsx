import { AmbientBackground } from '@/ui/AmbientBackground.jsx';
import { LandingNav } from './LandingNav.jsx';
import { LandingFooter } from './LandingFooter.jsx';
import { HeroSection } from './HeroSection.jsx';
import { FeaturesSection } from './FeaturesSection.jsx';
import { HowItWorksSection } from './HowItWorksSection.jsx';
import { CTASection } from './CTASection.jsx';

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
