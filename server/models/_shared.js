// Shared building blocks for every schema.

// Money is stored as a whole number of paise. Floats are rejected.
export const minorUnits = ({ min = 0, required = true, ...rest } = {}) => ({
  type: Number,
  required,
  min,
  validate: { validator: Number.isSafeInteger, message: '{PATH} must be a whole number of paise' },
  ...rest,
});

// Fields that must never leave the server, whatever the query selected.
const HIDDEN = ['passwordHash', 'refreshTokenHash', 'storagePath', 'failedLoginAttempts', 'lockUntil', 'accountSeq'];

const toJSON = {
  versionKey: false,
  transform(doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    for (const key of HIDDEN) delete ret[key];
    return ret;
  },
};

export const schemaOptions = { timestamps: true, toJSON };

// Makes a collection append-only: no updates, no deletes, no re-saving existing documents.
// (bulkWrite and raw collection access bypass Mongoose hooks, so the app never uses them on these.)
const BLOCKED_QUERIES = [
  'updateOne', 'updateMany', 'replaceOne', 'findOneAndUpdate', 'findOneAndReplace',
  'findOneAndDelete', 'deleteMany', 'deleteOne',
];

export function appendOnly(schema, label) {
  const fail = () => { throw new Error(`${label} records are append-only`); };
  schema.pre(BLOCKED_QUERIES, fail);
  schema.pre('deleteOne', { document: true, query: false }, fail);
  schema.pre('save', function () { if (!this.isNew) fail(); });
}
