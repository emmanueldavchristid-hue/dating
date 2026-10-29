/** Validation du formulaire d'inscription (mêmes règles que l'API : mot de passe ≥ 8). */
export function validateRegister(name: string, email: string, password: string) {
  return {
    name: name.trim().length < 2 ? "Au moins 2 caractères." : null,
    email: /^\S+@\S+\.\S+$/.test(email.trim()) ? null : "Adresse e-mail invalide.",
    password: password.length < 8 ? "8 caractères minimum." : null,
  };
}
