import Link from "next/link";

/** Shared back control so register / roster / sign / manage aren't cul-de-sacs. */
export default function RegisterBack({ href, label = "Back" }) {
  return (
    <p className="register-back">
      <Link href={href} className="register-back__link">
        ← {label}
      </Link>
    </p>
  );
}
