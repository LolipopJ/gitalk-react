export const hasClassInParent = (
  element: HTMLElement,
  ...className: string[]
): boolean => {
  if (!element || typeof element.className === "undefined") return false;

  let yes = false;
  const classes = element.className.split(" ");
  className.forEach((c) => {
    yes = yes || classes.indexOf(c) >= 0;
  });
  if (yes) return yes;

  return hasClassInParent(element.parentNode as HTMLElement, ...className);
};
