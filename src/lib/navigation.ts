export const BEFORE_NAVIGATION='folio:before-navigation';
export function confirmUnsavedNavigation():boolean {
 return typeof window==='undefined'||window.dispatchEvent(new Event(BEFORE_NAVIGATION,{cancelable:true}));
}
