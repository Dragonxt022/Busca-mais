const Typesense = require('typesense');
const config = require('./env');

const typesense = new Typesense.Client({
  nodes: [
    {
      host: config.typesense.host,
      port: config.typesense.port,
      protocol: config.typesense.protocol,
    },
  ],
  apiKey: config.typesense.apiKey,
  connectionTimeoutSeconds: 10,
});

const COLLECTION_NAME = 'pages';

const collectionSchema = {
  name: COLLECTION_NAME,
  fields: [
    { name: 'title', type: 'string' },
    { name: 'description', type: 'string', optional: true },
    { name: 'content', type: 'string', optional: true },
    { name: 'summary', type: 'string', optional: true },
    { name: 'url', type: 'string' },
    { name: 'slug', type: 'string', optional: true },
    { name: 'domain', type: 'string', facet: true },
    { name: 'category', type: 'string', facet: true, optional: true },
    { name: 'record_type', type: 'string', facet: true, optional: true },
    { name: 'source_id', type: 'int64', facet: true, optional: true },
    { name: 'source_name', type: 'string', facet: true, optional: true },
    { name: 'source_url', type: 'string', optional: true },
    { name: 'document_type', type: 'string', facet: true, optional: true },
    { name: 'document_number', type: 'string', optional: true },
    { name: 'document_date', type: 'string', optional: true },
    { name: 'publication_date', type: 'string', optional: true },
    { name: 'download_url', type: 'string', optional: true },
    { name: 'file_extension', type: 'string', facet: true, optional: true },
    { name: 'markdown_content', type: 'string', optional: true },
    { name: 'images', type: 'string[]', optional: true },
    { name: 'image_alts', type: 'string[]', optional: true },
    { name: 'image_thumbnails', type: 'string[]', optional: true },
    { name: 'image_context', type: 'string[]', optional: true },
    { name: 'image_filenames', type: 'string[]', optional: true },
    { name: 'has_images', type: 'bool', facet: true, optional: true },
    { name: 'cover_image', type: 'string', optional: true },
    { name: 'cover_thumbnail', type: 'string', optional: true },
    { name: 'cover_alt', type: 'string', optional: true },
    { name: 'source_state', type: 'string', facet: true, optional: true },
    { name: 'source_city', type: 'string', facet: true, optional: true },
    { name: 'language', type: 'string', facet: true, optional: true },
    { name: 'crawled_at', type: 'int64' },
    { name: 'relevance_score', type: 'float', optional: true },
  ],
  default_sorting_field: 'crawled_at',
};

async function syncCollectionFields() {
  const currentCollection = await typesense.collections(COLLECTION_NAME).retrieve();
  const currentFieldNames = new Set((currentCollection.fields || []).map((field) => field.name));
  const missingFields = collectionSchema.fields.filter((field) => !currentFieldNames.has(field.name));

  if (missingFields.length === 0) {
    return;
  }

  try {
    await typesense.collections(COLLECTION_NAME).update({
      fields: missingFields,
    });
  } catch (error) {
    if (error?.message?.includes('already part of the schema')) {
      return;
    }

    throw error;
  }

  console.log(`Colecao Typesense atualizada com ${missingFields.length} novos campos`);
}

async function ensureCollection() {
  try {
    await typesense.collections(COLLECTION_NAME).retrieve();
    await syncCollectionFields();
    console.log('Colecao Typesense ja existe');
  } catch (error) {
    if (error.httpStatus === 404) {
      await typesense.collections().create(collectionSchema);
      console.log('Colecao Typesense criada');
    } else {
      throw error;
    }
  }
}

module.exports = {
  typesense,
  COLLECTION_NAME,
  ensureCollection,
};
