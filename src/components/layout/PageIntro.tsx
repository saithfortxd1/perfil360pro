import type { ReactNode } from 'react';

import { MetaLabel } from '@/components/ui/MetaLabel';
import { cn } from '@/lib/utils';

export interface PageIntroProps {
  kicker: string;
  title: string;
  lead: string;
  className?: string;
  index?: string;
  children?: ReactNode;
}

export function PageIntro({ kicker, title, lead, className, index, children }: PageIntroProps) {
  return (
    <div className={cn('mb-8', className)}>
      <MetaLabel index={index}>{kicker}</MetaLabel>
      <h1 className="text-3xl font-bold text-mist-100 tracking-tight">{title}</h1>
      <p className="mt-3 text-lg text-mist-400 max-w-2xl">{lead}</p>
      {children}
    </div>
  );
}
