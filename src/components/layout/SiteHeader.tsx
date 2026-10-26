import { motion, useReducedMotion, useScroll, useSpring } from 'motion/react';
import { Link, NavLink, useNavigate } from 'react-router-dom';

import { BrandMark } from '@/components/ui/BrandMark';
import { cn } from '@/lib/utils';
import { navItems, paths } from '@/routes/paths';
import { useAuth } from '@/contexts/AuthContext';

export function SiteHeader() {
  const { scrollYProgress } = useScroll();
  const prefersReducedMotion = useReducedMotion();
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.3 });
  const progress = prefersReducedMotion ? scrollYProgress : smoothProgress;
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleProtectedClick = (e: React.MouseEvent, targetPath: string) => {
    e.preventDefault();
    if (user) {
      navigate(targetPath);
    } else {
      navigate(paths.login);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-ink-700/80 bg-ink-950/80 backdrop-blur-md">
      <div className="shell flex min-h-16 flex-wrap items-center justify-between gap-2 py-2 sm:h-16 sm:flex-nowrap sm:gap-4 sm:py-0">
        <Link to={paths.home} className="inline-flex items-center gap-2 rounded-md" aria-label="Perfil 360 AI, ir al inicio">
          <BrandMark />
          <span className="text-sm font-semibold text-mist-100">Perfil 360 AI</span>
        </Link>

        <nav className="ml-auto w-full sm:w-auto" aria-label="Navegación principal">
          <ul className="flex flex-wrap items-center justify-end gap-0.5 sm:flex-nowrap sm:gap-1">
            {navItems.map((item) => {
              const isProtected = item.to === paths.panel || item.to === paths.simulador;

              if (isProtected) {
                return (
                  <li key={item.to}>
                    <button
                      type="button"
                      onClick={(e) => handleProtectedClick(e, item.to)}
                      className={cn(
                        'relative inline-flex min-h-10 items-center rounded-md px-2.5 text-sm transition-colors duration-200 sm:px-3',
                        'text-mist-400 hover:text-mist-50',
                      )}
                    >
                      <span>{item.label}</span>
                    </button>
                  </li>
                );
              }

              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end ?? false}
                    className={({ isActive }) =>
                      cn(
                        'relative inline-flex min-h-10 items-center rounded-md px-2.5 text-sm transition-colors duration-200 sm:px-3',
                        isActive ? 'text-mist-50' : 'text-mist-400 hover:text-mist-50',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span>{item.label}</span>
                        {isActive ? (
                          <motion.span
                            layoutId="nav-active-indicator"
                            className="absolute inset-x-2 -bottom-px h-px bg-signal-400"
                            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                          />
                        ) : null}
                      </>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <motion.div
        aria-hidden="true"
        style={{ scaleX: progress }}
        className="h-px w-full origin-left bg-gradient-to-r from-signal-400 via-signal-300 to-ion-500"
      />
    </header>
  );
}