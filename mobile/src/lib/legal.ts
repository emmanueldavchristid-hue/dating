/**
 * Textes juridiques — VERSION DE TRAVAIL à faire relire par un juriste avant la mise en ligne.
 * Ils décrivent ce que l'application fait réellement aujourd'hui (voir backend : données, durées, prestataires).
 * Les éléments entre crochets sont à compléter (société, adresse, contact).
 */
export interface LegalDoc {
  title: string;
  updated: string;
  sections: { title: string; body: string[] }[];
}

export const PRIVACY: LegalDoc = {
  title: "Politique de confidentialité",
  updated: "7 novembre 2026",
  sections: [
    {
      title: "Qui est responsable",
      body: [
        "[Nom de la société], [adresse], Abidjan, Côte d'Ivoire — contact : [adresse e-mail de contact].",
        "Le traitement respecte la loi ivoirienne n° 2013-450 du 19 juin 2013 relative à la protection des données à caractère personnel, sous le contrôle de l'ARTCI.",
      ],
    },
    {
      title: "Ce que nous collectons",
      body: [
        "Ton compte : e-mail, nom affiché, mot de passe (jamais stocké en clair : seule une empreinte chiffrée est gardée).",
        "Tes choix dans l'app : préférences (catégories, ambiances, budget, ville), favoris, collections, soirées enregistrées, avis, signalements.",
        "Tes actions sur les lieux (fiches vues, itinéraires demandés, partages) pour te recommander des lieux qui te ressemblent.",
        "Ta position, seulement si tu l'autorises : elle sert à trier les lieux par distance et à tracer un trajet. L'historique de recherche garde une position arrondie à environ 1 km, puis il est effacé au bout de 30 jours.",
        "Les messages envoyés au concierge.",
      ],
    },
    {
      title: "Prestataires",
      body: [
        "Concierge IA : quand il est activé, ta question et les fiches de lieux sélectionnées sont envoyées à un fournisseur d'IA (Groq, Google Gemini ou NVIDIA) pour rédiger la réponse. Aucune donnée de compte (e-mail, nom) ne leur est transmise.",
        "Photos des lieux : certaines photos sont chargées depuis Google (Google Places). Google reçoit alors l'adresse technique de ton téléphone, comme pour toute image en ligne.",
        "Cartes : fond de carte Apple Plans (iPhone) ou Google Maps (Android). Itinéraires calculés sur nos serveurs à partir des données OpenStreetMap.",
        "Hébergement : [nom de l'hébergeur et pays].",
      ],
    },
    {
      title: "Ce que nous ne faisons pas",
      body: ["Nous ne vendons pas tes données. Nous n'affichons pas de publicité ciblée. Nous ne partageons pas ta position avec les lieux."],
    },
    {
      title: "Tes droits",
      body: [
        "Depuis l'onglet Moi : télécharger toutes tes données, retirer l'accès à ta position, supprimer ton compte (tes données personnelles sont effacées ; tes avis restent, rendus anonymes).",
        "Pour toute autre demande (accès, rectification, opposition) : [adresse e-mail de contact]. Tu peux aussi saisir l'ARTCI.",
      ],
    },
  ],
};

export const TERMS: LegalDoc = {
  title: "Conditions d'utilisation",
  updated: "7 novembre 2026",
  sections: [
    {
      title: "Le service",
      body: [
        "L'application aide à trouver des lieux de sortie et de détente, surtout à Abidjan, Grand-Bassam et Assinie. Les informations proviennent de sources ouvertes (OpenStreetMap, Wikidata), de notre équipe, des lieux eux-mêmes et des utilisateurs.",
        "Nous faisons de notre mieux pour qu'elles soient exactes, mais horaires, prix et ouvertures peuvent changer : vérifie auprès du lieu avant de te déplacer. Les distances sont à vol d'oiseau ; les durées de trajet sont calculées sans le trafic.",
      ],
    },
    {
      title: "Ton compte",
      body: [
        "Tu es responsable de ton mot de passe et de ce qui est publié depuis ton compte. Tu peux supprimer ton compte à tout moment depuis l'onglet Moi.",
      ],
    },
    {
      title: "Avis et contenus",
      body: [
        "Tes avis doivent refléter une expérience réelle, sans insulte, propos discriminatoire, donnée personnelle d'autrui ni publicité. Nous pouvons retirer un contenu qui ne respecte pas ces règles.",
      ],
    },
    {
      title: "Concierge IA",
      body: [
        "Le concierge ne propose que des lieux présents dans notre base. Ses réponses peuvent être imparfaites : elles ne remplacent pas une vérification auprès du lieu.",
      ],
    },
    {
      title: "Offres payantes",
      body: [
        "Les offres premium, leurs prix et leurs conditions de paiement et de résiliation seront indiqués avant tout achat. Aucun paiement n'est actif aujourd'hui.",
      ],
    },
    {
      title: "Droit applicable",
      body: ["Ces conditions sont soumises au droit ivoirien. Contact : [adresse e-mail de contact]."],
    },
  ],
};
