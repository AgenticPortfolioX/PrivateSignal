import { MOCK_RAW_MESSARI_AAVE_RESPONSE } from './fixtures/samplePositions';

const originalFetch = global.fetch;

global.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.toString();
  
  if (url.includes('gateway.thegraph.com') || url.includes('blue-api.morpho.org')) {
    return new Response(JSON.stringify(MOCK_RAW_MESSARI_AAVE_RESPONSE), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return originalFetch(input, init);
};
