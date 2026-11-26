import { Suspense } from 'react';
import BrowseClient from './BrowseClient';
import { ProductGridSkeleton } from '@/components/campus/ui';

export default function Page() {
  return <Suspense fallback={<div className="container-page py-8"><ProductGridSkeleton /></div>}><BrowseClient /></Suspense>;
}
