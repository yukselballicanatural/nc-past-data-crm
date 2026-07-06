const FALLBACK_URL = 'https://aztxfncqanrodbttywrb.supabase.co';
const FALLBACK_KEY = 'sb_publishable_IkbCNelsIjBPW6Tqkq4Egw_djjzvTXL';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    url: process.env.SUPABASE_URL || FALLBACK_URL,
    key: process.env.SUPABASE_KEY || FALLBACK_KEY
  });
}
