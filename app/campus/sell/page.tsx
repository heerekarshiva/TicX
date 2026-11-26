import { Suspense } from 'react';
import SellClient from './SellClient';
export default function Page() { return <Suspense fallback={null}><SellClient /></Suspense>; }
