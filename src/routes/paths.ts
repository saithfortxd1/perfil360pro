export const paths = {
  home: '/',
  historia: '/historia-proyecto',
  panel: '/panel',
  login: '/login',
  simulador: '/simulador',
} as const;

export interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly end?: boolean;
}

export const navItems: readonly NavItem[] = [
  { to: paths.home, label: 'Inicio', end: true },
  { to: paths.historia, label: 'Historia' },
  { to: paths.simulador, label: 'Simulador' },
  { to: paths.panel, label: 'Panel' },
];
