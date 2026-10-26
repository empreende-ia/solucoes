/**
 * Tipos compartilhados pelos forms de instalação.
 */

import type { InstallData } from '@/lib/installer/types';

export interface FormProps {
  data: InstallData;
  onComplete: (data: Partial<InstallData>) => void;
  onBack: () => void;
  showBack: boolean;
}
