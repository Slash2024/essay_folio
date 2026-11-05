import type { SVGProps } from 'react';

// Original Essay Folio artwork: folded paper, ink and correction strokes.
// All lettering is normal HTML; these paths contain no fonts or external symbols.
export function AchievementMedal(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 32 36" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true" focusable="false" {...props}><path d="M16 3 27 9v13l-11 6L5 22V9Z"/><path d="m10 13 5 6 8-9M7 24 4 33l7-2 4 3 2-6m5-3 5 9-7-3-3 2"/><path d="m22 6 5 3-5 2Z" fill="currentColor" stroke="none" opacity=".15"/></svg>;
}
export type AchievementArtKind = 'hero' | 'large' | 'small' | 'two' | 'first' | 'ten' | 'rewrite' | 'complete';
export function AchievementArt({kind, ...props}: SVGProps<SVGSVGElement> & {kind: AchievementArtKind}) {
  let drawing;
  switch (kind) {
    case 'hero': drawing = <><path d="M18 34 67 24l13 65-50 10Z"/><path d="m41 13 52-4 11 68-53 8Z" fill="var(--achievement-paper,#fff)"/><path d="m90 10 3 13 10-1M52 34l28-3M55 45l29-3M57 56l19-2M56 78c13-19 16 9 28-5s13 8 22-6"/><path d="m94 62 14-25 8 4-14 25-10 7Z" fill="currentColor" fillOpacity=".1"/><path d="m108 37 5-8c3-3 8 0 6 4l-3 8m-21 23 7 2"/></>;break;
    case 'large': drawing = <><path d="m31 17 61-4-9 77-61 5Z"/><path d="m44 32 31-2M42 44l31-2M40 56l24-2"/><path d="m76 80 24-40 8 5-24 40-12 7Z" fill="currentColor" fillOpacity=".1"/><path d="m100 40 5-7c4-4 9 0 6 4l-3 8M75 81l9 4"/></>;break;
    case 'small': drawing = <><path d="m24 31 54-9 13 65-54 10Z"/><path d="m47 13 53 4-5 69-53-4Z" fill="var(--achievement-paper,#fff)"/><path d="m57 34 29 2M56 45l29 2M55 56l22 2"/><path d="M88 84c4-18 19-18 26-13-5 11-15 16-26 13Zm0 0c4-11-1-22-11-26-6 13-2 23 11 26Z" fill="currentColor" fillOpacity=".08"/></>;break;
    case 'two': drawing = <><path d="m20 36 50-8 12 62-50 9Z"/><path d="m39 21 54-7 12 65-54 9Z" fill="var(--achievement-paper,#fff)"/><path d="m56 36 29-4M58 47l29-4M60 58l21-3"/><path d="m88 89 25-20m-24 21 3-9 10 10-13-1Z"/></>;break;
    case 'first': drawing = <><path d="M19 88 34 25l75-12-18 72Z"/><path d="m42 38 25-4M39 48l17-2"/><path d="m66 44 10 15-13 17-9-16Z" fill="currentColor" fillOpacity=".14"/><path d="m66 44-3 32m-9-16 22-1M101 80l20-30"/><circle cx="98" cy="86" r="3" fill="currentColor"/><path d="M16 95c29-10 60-12 89-7" strokeOpacity=".17" strokeWidth="7"/></>;break;
    case 'ten': drawing = <><path d="m19 49-7 4 11 40 42-5 44 5 11-40-7-3M25 39l-8 4 10 45 38-3 40 3 9-44-9-4M31 29l-9 4 10 47 33 4 35-4 8-46-10-4"/><path d="M65 34C52 25 42 24 32 26v51c11-1 22 3 33 10 11-7 22-11 33-10V26c-10-2-20-1-33 8Z" fill="var(--achievement-paper,#fff)"/><path d="M65 34v53M42 42l13 4M42 54l13 4M42 66l13 4m20-24 13-4M75 58l13-4M75 70l13-4M65 11v11M49 12l5 10m27-10-5 10"/></>;break;
    case 'rewrite': drawing = <><path d="m22 38 65-4-13 58-63 4Z"/><path d="m44 18 64-5-12 60-65 4Z" fill="var(--achievement-paper,#fff)"/><path d="m100 15-1 17 13-2M55 34l29-2M52 43l20-1"/><path d="M51 61c41-23 27 5 18 12s5 13 18 1l25-24M43 74l-4 18 65-5 12-33-13 1"/><path d="m42 97 55-5" strokeOpacity=".17" strokeWidth="6"/></>;break;
    case 'complete': drawing = <><path d="M25 48 74 24l26 5v52L52 99 25 88Z"/><path d="M41 35 91 12v59L41 94Z" fill="var(--achievement-paper,#fff)"/><path d="m58 32 47-12v64L58 96Z" fill="var(--achievement-paper,#fff)"/><path d="M41 94 108 63 58 49M70 37l24-6M72 79l23-6M28 56l8-4M28 66l8-4"/></>;break;
  }
  return <svg viewBox="0 0 136 112" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{drawing}</svg>;
}
