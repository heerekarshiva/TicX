import { ImageResponse } from 'next/og';

<<<<<<< HEAD
=======
export const runtime = 'edge';
>>>>>>> 952ded43d45a4b3be5481656a06799a8854925de
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#071B36', color: '#FF7A00', fontSize: 120, fontWeight: 900 }}>
        X
      </div>
    ),
    size
  );
}
