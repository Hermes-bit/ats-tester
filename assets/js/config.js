/* ATS Tester — configuration des espaces personnels
 *
 * Laissé vide : chaque espace est enregistré dans le navigateur de l'appareil
 * (mot de passe haché, candidatures gardées sur cet appareil).
 *
 * Rempli avec un projet Supabase gratuit : les comptes et les candidatures sont
 * synchronisés sur tous les appareils. Voir « Activer la synchronisation » dans le README.
 * La clé à coller est la clé publique (« anon » ou « publishable ») : elle est faite
 * pour être visible, les données de chacun sont protégées par les règles de la table.
 */
window.ATS = window.ATS || {};
ATS.config = {
  supabaseUrl: "",
  supabaseKey: "",
};
