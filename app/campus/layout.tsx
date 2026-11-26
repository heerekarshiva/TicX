import { Toaster } from '@/components/campus/ui';

// No metadata here on purpose: canonicals must be set per page (a layout-level canonical is inherited by every child).
export default function CampusLayout({ children }: { children: React.ReactNode }) {
  return (<>{children}<Toaster /></>);
}
