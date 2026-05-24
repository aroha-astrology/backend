// DRAFT — review with legal counsel before public launch.
// Single source of truth for the bundled legal documents (Terms, Privacy,
// Astrology Disclaimer). The /terms and /privacy pages and the
// LegalAcceptModal all read from this module so the user sees the same wording
// everywhere. Bumping LEGAL_VERSION re-prompts every user on their next visit.

export const LEGAL_VERSION = 1;
export const LEGAL_LAST_UPDATED = '2026-05-10';

export const COMPANY_NAME = 'Aroha Astrology';
export const CONTACT_EMAIL = 'support@arohaastrology.in';

// ── Operator details ─────────────────────────────────────────────────────
// REQUIRED before public launch. Razorpay verifies these on the contact-us
// page during KYC. Indian DPDP Act s.10 requires the Grievance Officer to
// be a resident of India and contactable.
export const COMPANY_ADDRESS = '[FILL: full registered address with PIN code]';
export const SUPPORT_PHONE   = '[FILL: support phone, e.g. +91-XXXXXXXXXX]';
export const GRIEVANCE_OFFICER = {
  name: '[FILL: grievance officer name]',
  email: 'support@arohaastrology.in',
  phone: '[FILL: grievance officer phone]',
};
export const GSTIN = '[FILL: GSTIN once registered, or leave as-is]';
export const REFUND_WINDOW_DAYS = 7;

export interface LegalSection {
  heading: string;
  body: string[];
}

// ── Highlights shown inside the acceptance modal ──────────────────────────
// Plain-English bullets so the user gets the gist without reading the full
// documents (research finding: dense walls of text reduce informed consent).
export const LEGAL_HIGHLIGHTS: string[] = [
  'Predictions are AI interpretations of Vedic calculations — guidance for reflection, not professional advice.',
  'Your birth details and chat history are stored securely on Supabase with row-level access control.',
  'You can delete your account and data at any time from Settings.',
  'Payments are processed by Razorpay; we never see or store your card details.',
  'You must be 18 or older to use Aroha Astrology.',
];

export const ASTROLOGY_DISCLAIMER =
  'Astrological predictions on Aroha Astrology are intended as guidance for reflection and self-understanding only. They are not a substitute for professional medical, legal, financial, or psychological advice. For decisions that affect your health, finances, or wellbeing, consult a qualified professional.';

// ── Terms & Conditions ────────────────────────────────────────────────────
export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: '1. Acceptance of Terms',
    body: [
      `By creating an account or using ${COMPANY_NAME} ("the Service"), you agree to be bound by these Terms & Conditions, our Privacy Policy, and the Astrology Disclaimer. If you do not agree, do not use the Service.`,
      'We may update these Terms from time to time. Material changes will trigger a re-acceptance prompt the next time you sign in.',
    ],
  },
  {
    heading: '2. The Service',
    body: [
      `${COMPANY_NAME} provides Vedic astrology tools — including kundli (birth chart) generation, planetary period (dasha) analysis, transit reports, AI-generated interpretations, video readings, and the option to book consultations or pujas with independent pandits.`,
      'Astronomical calculations are performed using Swiss Ephemeris. Interpretations are generated with the help of large language models trained on Vedic astrology texts.',
    ],
  },
  {
    heading: '3. Eligibility',
    body: [
      'You must be at least 18 years old to create an account.',
      'You agree to provide accurate birth details (date, time, and place of birth). The accuracy of predictions depends on this information; we cannot guarantee results from incorrect data.',
      'One personal account per user. You may add multiple birth profiles within your single account for family members or others (with their consent).',
    ],
  },
  {
    heading: '4. Your Account',
    body: [
      'You are responsible for keeping your login credentials confidential and for all activity under your account. Notify us immediately if you believe your account has been accessed without authorisation.',
      'We may suspend or terminate accounts that violate these Terms, attempt to circumvent the credit system, or abuse the Service.',
    ],
  },
  {
    heading: '5. Credits, Tokens & Payments',
    body: [
      'Many features consume credits ("tokens"). New accounts receive a signup bonus. Additional credits can be purchased through the in-app store.',
      'Payments are processed by Razorpay. Prices are shown inclusive of applicable taxes. Once credits are added to your account, they are non-refundable except where required by law or where we expressly state otherwise (e.g. failed payment, billing error).',
      'Coupons and promotional credits may have expiry dates and per-user limits as shown at the time of redemption.',
    ],
  },
  {
    heading: '6. Premium & Subscriptions',
    body: [
      'Some features may require a Premium subscription. Subscription terms — billing cycle, auto-renewal, and cancellation — are shown at the point of purchase.',
      'You can cancel a subscription at any time from your account settings; access continues until the end of the paid period.',
    ],
  },
  {
    heading: '7. User Content',
    body: [
      'You retain ownership of the birth details, questions, and chat content you provide. You grant us a limited licence to use this content solely to operate the Service for you (generating your charts, predictions, and reports).',
      'We do not sell your personal astrological data to third parties.',
    ],
  },
  {
    heading: '8. Acceptable Use',
    body: [
      'You agree not to: scrape or automate access to the Service; resell predictions or generated content as a service; reverse-engineer the platform; upload unlawful, harassing, or harmful content; or attempt to disrupt the Service for other users.',
      'We may rate-limit, suspend, or terminate accounts that engage in abusive behaviour.',
    ],
  },
  {
    heading: '9. Astrology Disclaimer',
    body: [
      ASTROLOGY_DISCLAIMER,
      'Vedic astrology is a contemplative tradition, not an exact science. Outcomes in life depend on many factors including your own choices.',
    ],
  },
  {
    heading: '10. Intellectual Property',
    body: [
      `${COMPANY_NAME}, its logo, the user interface, the prediction engine, and all original content are owned by ${COMPANY_NAME} and protected by intellectual property law.`,
      'Swiss Ephemeris is used under its applicable licence. Third-party trademarks belong to their respective owners.',
    ],
  },
  {
    heading: '11. Third-party Services',
    body: [
      'We use carefully selected third-party providers to deliver the Service:',
      '• Supabase — authentication, database, and storage.',
      '• Anthropic Claude — generating natural-language interpretations.',
      '• Sarvam AI — text-to-speech for video readings.',
      '• Razorpay — payment processing.',
      '• Independent pandits — fulfilling consultation and puja bookings you initiate.',
      'Your use of features powered by these providers is also subject to their respective terms.',
    ],
  },
  {
    heading: '12. Termination',
    body: [
      'You may delete your account at any time from Settings. We may suspend or terminate your account for violation of these Terms, fraud, or risk to other users.',
      'Termination does not refund unused credits unless required by law.',
    ],
  },
  {
    heading: '13. Disclaimer of Warranties & Limitation of Liability',
    body: [
      'The Service is provided "as is" without warranty of any kind. We do not guarantee the accuracy, completeness, or outcome of any prediction or remedy.',
      `To the fullest extent permitted by law, ${COMPANY_NAME} and its officers, employees, and partners shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or related to your use of the Service. Our total liability is limited to the amount you paid us in the 12 months preceding the claim.`,
    ],
  },
  {
    heading: '14. Governing Law & Disputes',
    body: [
      'These Terms are governed by the laws of India. Any dispute will be subject to the exclusive jurisdiction of the courts at [city — to be confirmed by counsel].',
      'Before initiating any legal proceeding, you agree to first contact us at the email below so we can attempt to resolve the matter informally.',
    ],
  },
  {
    heading: '15. Changes to These Terms',
    body: [
      'We may update these Terms. When we do, we will increment the legal version number, and the next time you sign in we will ask you to accept the updated documents before continuing to use the Service.',
    ],
  },
  {
    heading: '16. Contact',
    body: [
      `Questions or notices about these Terms should be sent to ${CONTACT_EMAIL}.`,
    ],
  },
];

// ── Privacy Policy ────────────────────────────────────────────────────────
export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: '1. Information We Collect',
    body: [
      'Account information — name, email, phone (optional), and password hash. If you sign in with Google, we receive your name, email, and profile picture from Google.',
      'Birth details — date, time, and place of birth for each profile you create. These are required to compute astrological charts.',
      'Usage and content — questions you ask, chat history, predictions generated for you, and which features you use.',
      'Payment metadata — transaction IDs and amounts from Razorpay. We do not collect or store your card or bank details.',
      'Device and log data — IP address, browser type, and crash reports for security and reliability.',
    ],
  },
  {
    heading: '2. How We Use Your Information',
    body: [
      'To generate your kundli, predictions, and remedy suggestions.',
      'To deliver the features you ask for (matchmaking, transits, video readings, pandit bookings).',
      'To operate, secure, and improve the Service — including debugging and abuse prevention.',
      'To communicate essential service messages (account, payments, security). We do not send marketing emails without your consent.',
    ],
  },
  {
    heading: '3. How We Share Information',
    body: [
      'We share data only with the providers needed to run the Service:',
      '• Supabase — to host your account and chart data.',
      '• Anthropic — for AI interpretations of your charts. Only the data needed for the prediction is sent.',
      '• Sarvam AI — for text-to-speech generation of video readings.',
      '• Razorpay — for payment processing.',
      '• Independent pandits — only the details required to fulfil a booking you initiate.',
      'We do not sell your personal data. We do not share your data with advertisers.',
    ],
  },
  {
    heading: '4. Storage & Security',
    body: [
      'Your data is stored on Supabase (PostgreSQL) with row-level security so only you and authorised staff can access your records. Connections are encrypted in transit (TLS).',
      'Passwords are hashed; we cannot read them. We follow industry-standard practices to protect your account, but no online service can guarantee absolute security.',
    ],
  },
  {
    heading: '5. Retention & Deletion',
    body: [
      'We keep your data while your account is active. You can delete your account at any time from Settings; this removes your profiles, charts, predictions, and chat history.',
      'Some records (e.g. payment receipts, abuse logs) may be retained for the period required by law or for legitimate business reasons.',
    ],
  },
  {
    heading: '6. Your Rights',
    body: [
      'Depending on where you live (e.g. under the GDPR or India\'s DPDP Act) you may have rights to access, correct, export, or delete the personal data we hold about you, and to withdraw consent.',
      `To exercise these rights, contact us at ${CONTACT_EMAIL}. We will respond within the timeframes required by applicable law.`,
    ],
  },
  {
    heading: '7. Cookies & Local Storage',
    body: [
      'We use cookies and browser local storage to keep you signed in, remember your preferences (theme, language, chart style), and cache data for faster page loads.',
      'We do not use third-party advertising cookies.',
    ],
  },
  {
    heading: '8. Children',
    body: [
      'The Service is not intended for users under 18. We do not knowingly collect personal information from minors. If you believe a minor has created an account, contact us and we will delete it.',
    ],
  },
  {
    heading: '9. Changes to this Policy',
    body: [
      'We may update this Policy. Material changes will trigger a re-acceptance prompt the next time you sign in. The "Last updated" date at the top of the page reflects the latest revision.',
    ],
  },
  {
    heading: '10. Contact / Grievance Officer',
    body: [
      `For privacy-related questions or to lodge a grievance, write to ${CONTACT_EMAIL}.`,
      `Grievance Officer: ${GRIEVANCE_OFFICER.name}. Email: ${GRIEVANCE_OFFICER.email}. Phone: ${GRIEVANCE_OFFICER.phone}.`,
      `Postal address: ${COMPANY_ADDRESS}.`,
      'We respond to grievances within the timelines required under the IT Rules 2021 and the DPDP Act 2023.',
    ],
  },
];

// ── Refund & Cancellation Policy ──────────────────────────────────────────
export const REFUND_SECTIONS: LegalSection[] = [
  {
    heading: '1. Overview',
    body: [
      `${COMPANY_NAME} sells digital tokens that unlock features such as premium reports, AI conversations, video readings and predictions. Tokens are delivered to your account immediately on successful payment and consumed when you use a feature.`,
      `This Policy explains when and how you can request a refund.`,
    ],
  },
  {
    heading: '2. Eligibility',
    body: [
      `You may request a refund within ${REFUND_WINDOW_DAYS} days of purchase if all of the following apply:`,
      '• You have not consumed any of the tokens from that purchase.',
      '• The payment was charged but the tokens were not credited (failed delivery, technical error).',
      '• You were charged twice for the same order due to a billing error.',
      'Refund requests outside these conditions will be reviewed on a case-by-case basis but are not guaranteed.',
    ],
  },
  {
    heading: '3. Non-refundable items',
    body: [
      'Once tokens have been consumed (a report generated, an AI chat completed, a video reading rendered), they are non-refundable. Generated content is delivered at the moment of consumption and cannot be returned.',
      'Promotional credits and coupons have no cash value and are non-refundable.',
    ],
  },
  {
    heading: '4. How to request a refund',
    body: [
      `Email ${CONTACT_EMAIL} with the subject "Refund Request", your registered email, the Razorpay payment ID, and a brief reason. We will acknowledge within 2 business days and resolve within 7 business days.`,
    ],
  },
  {
    heading: '5. Processing time',
    body: [
      'Approved refunds are processed back to the original payment method via Razorpay. Funds typically reflect within 5–7 business days, depending on your bank or card issuer.',
      'You will receive a refund confirmation email when Razorpay processes the reversal.',
    ],
  },
  {
    heading: '6. Disputes',
    body: [
      `If you are unhappy with a refund decision, contact our Grievance Officer (${GRIEVANCE_OFFICER.email}). Indian users may also approach the appropriate Consumer Forum under the Consumer Protection Act, 2019.`,
    ],
  },
];

// ── Cancellation Policy ───────────────────────────────────────────────────
export const CANCELLATION_SECTIONS: LegalSection[] = [
  {
    heading: '1. What "cancellation" means here',
    body: [
      `${COMPANY_NAME} delivers digital tokens on instant payment, so there is no shipment or delivery window during which an order can be cancelled before fulfilment.`,
      'You can choose not to use tokens you have purchased; unused tokens remain on your account.',
    ],
  },
  {
    heading: '2. Subscription cancellation (if applicable)',
    body: [
      'If you have purchased a recurring subscription, you can cancel auto-renewal at any time from Settings → Subscription. Access continues until the end of the paid billing period.',
      'Cancelling a subscription does not refund the current period unless you also qualify for a refund under our Refund Policy.',
    ],
  },
  {
    heading: '3. Account closure',
    body: [
      'You can close your account at any time from Settings. This deletes your profiles, charts, predictions and chat history, and forfeits any unused tokens.',
      `Some records (payment receipts, abuse logs) are retained for the period required by law.`,
    ],
  },
  {
    heading: '4. Contact',
    body: [
      `Questions: ${CONTACT_EMAIL}.`,
    ],
  },
];

// ── Shipping Policy (digital goods) ───────────────────────────────────────
export const SHIPPING_SECTIONS: LegalSection[] = [
  {
    heading: '1. Digital delivery only',
    body: [
      `${COMPANY_NAME} sells digital products only — tokens that unlock features inside the app. We do not ship any physical goods.`,
    ],
  },
  {
    heading: '2. Delivery time',
    body: [
      'Tokens are credited to your account within seconds of a successful payment confirmation from Razorpay.',
      'Generated content (kundli charts, reports, video readings) is produced on demand within the app, typically within seconds to a few minutes depending on the feature.',
    ],
  },
  {
    heading: '3. Failed delivery',
    body: [
      `In rare cases of payment-success-but-no-credit, contact ${CONTACT_EMAIL} with your Razorpay payment ID. We reconcile via Razorpay's webhook system; most issues self-resolve within minutes. Confirmed failed deliveries are refunded under our Refund Policy.`,
    ],
  },
  {
    heading: '4. Geography',
    body: [
      `${COMPANY_NAME} is operated from India. Tokens and content can be accessed from anywhere in the world subject to applicable local laws.`,
    ],
  },
];

// ── Contact Us page content ───────────────────────────────────────────────
export const CONTACT_BLOCK = {
  legalEntity: COMPANY_NAME,
  email: CONTACT_EMAIL,
  phone: SUPPORT_PHONE,
  address: COMPANY_ADDRESS,
  gstin: GSTIN,
  grievanceOfficer: GRIEVANCE_OFFICER,
  hours: 'Monday–Saturday, 10:00–18:00 IST (excluding public holidays)',
};
