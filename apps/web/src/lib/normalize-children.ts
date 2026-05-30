import { isValidElement, type ReactNode } from 'react';

export function normalizeChildren(children: ReactNode): ReactNode {
  const isSlotObject =
    typeof children === 'object' &&
    children !== null &&
    !isValidElement(children) &&
    !Array.isArray(children) &&
    !(children instanceof Promise);

  return isSlotObject
    ? Object.values(children as unknown as Record<string, ReactNode>)
    : children;
}
