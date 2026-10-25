// Release-specific protocol contract. DR4 requires its own validated adapter.
export const GAIA_DR3_HIPS = Object.freeze({
  release: 'Gaia DR3', provider: 'ESA Gaia / CDS',
  baseUrl: 'https://hipscat.cds.unistra.fr/HiPSCatService/I/355/gaiadr3',
  creatorDid: 'ivo://CDS/I/355/gaiadr3', referenceEpoch: 2016,
  minOrder: 1, maxOrder: 11, totalSources: 1811709771,
  documentation: 'https://cdsarc.cds.unistra.fr/ftp/I/355/ReadMe',
});
