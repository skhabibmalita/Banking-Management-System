const fmt = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "INR 1,23,456.78". Plain text on purpose: the PDF's built-in font has no rupee sign.
export const formatINR = (paise) => `INR ${fmt.format(paise / 100)}`;
export const maskAccount = (number = '') => `•••• ${String(number).slice(-4)}`;
