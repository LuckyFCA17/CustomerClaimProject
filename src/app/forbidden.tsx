import { ForbiddenNotice } from "@/components/shared/forbidden-notice";

/** Dirender dengan status HTTP 403 yang sebenarnya oleh forbidden(). */
export default function Forbidden() {
  return <ForbiddenNotice />;
}
