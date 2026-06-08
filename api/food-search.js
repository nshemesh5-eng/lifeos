// Food search proxy — bypasses CORS + adds Israeli products database
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || 'https://lifeos-eight-inky.vercel.app')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { q = '', page = 1, barcode = '' } = req.query

  // ── Barcode lookup ─────────────────────────────────────────────
  if (barcode) {
    try {
      const r = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`,
        { headers: { 'User-Agent': 'Shimshon-LifeOS/1.0' }, signal: AbortSignal.timeout(8000) }
      )
      const d = await r.json()
      if (d.status === 1) {
        return res.status(200).json({ product: mapProduct(d.product), source: 'off' })
      }
      return res.status(404).json({ error: 'not found' })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  if (!q) return res.status(400).json({ error: 'missing query' })

  const results = []
  const query = q.trim().toLowerCase()

  // ── 1. Israeli products local DB (instant, no API needed) ──────
  const israeliMatches = ISRAELI_DB.filter(p =>
    p.name.toLowerCase().includes(query) ||
    p.name_he?.includes(q) ||
    p.brand?.toLowerCase().includes(query) ||
    p.tags?.some(t => t.includes(query) || t.includes(q))
  )
  results.push(...israeliMatches.map(p => ({ ...p, source: 'local' })))

  // ── 2. Open Food Facts — search in Hebrew + English + Israeli ──
  // Hebrew to common English translations for better OFF search
  const hebrewToEnglish = {
    'עוף':'chicken','חזה עוף':'chicken breast','בשר':'beef','דג':'fish','סלמון':'salmon',
    'טונה':'tuna','ביצה':'egg','גבינה':'cheese','חלב':'milk','יוגורט':'yogurt',
    'אורז':'rice','פסטה':'pasta','לחם':'bread','פיתה':'pita bread',
    'שוקולד':'chocolate','עוגה':'cake','ביסקוויט':'biscuit','חטיף':'snack',
    'בננה':'banana','תפוח':'apple','תפוז':'orange','אבוקדו':'avocado',
    'עגבנייה':'tomato','מלפפון':'cucumber','גזר':'carrot','ברוקולי':'broccoli',
    'שקדים':'almonds','אגוזים':'walnuts','טחינה':'tahini','חומוס':'hummus',
    'שמן זית':'olive oil','חמאה':'butter','קוטג׳':'cottage cheese',
    'שיבולת שועל':'oats','קוואקר':'oatmeal','גרנולה':'granola',
    'במבה':'bamba','ביסלי':'bisli','פריגת':'prigat juice',
  }
  const englishQ = hebrewToEnglish[q] || q
  const searches = [
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&action=process&json=1&page=${page}&page_size=12&sort_by=unique_scans_n&fields=code,product_name,product_name_he,brands,image_url,image_thumb_url,nutriments,nutriscore_grade,nova_group,quantity,ingredients_text,labels_tags&countries_tags=il`,
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(englishQ)}&action=process&json=1&page=${page}&page_size=12&sort_by=unique_scans_n&fields=code,product_name,product_name_he,brands,image_url,image_thumb_url,nutriments,nutriscore_grade,nova_group,quantity,ingredients_text,labels_tags`,
  ]

  let offCount = 0
  for (const url of searches) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Shimshon-LifeOS/1.0' },
        signal: AbortSignal.timeout(8000)
      })
      if (!r.ok) continue
      const d = await r.json()
      const products = (d.products || [])
        .map(mapProduct)
        .filter(p => p.name && p.calories > 0)
      
      // Deduplicate against existing results
      for (const p of products) {
        if (!results.find(r => r.barcode === p.barcode || r.name === p.name)) {
          results.push({ ...p, source: 'off' })
          offCount++
        }
      }
      if (offCount >= 20) break
    } catch { continue }
  }

  return res.status(200).json({
    products: results.slice(0, 40),
    count: results.length,
    query: q
  })
}

function mapProduct(p) {
  const n = p.nutriments || {}
  // Prefer Hebrew name, then English, then any name
  const rawName = p.product_name_he || p.product_name_en || p.product_name || ''
  const name = rawName.length > 0 ? rawName : (p.brands ? p.brands.split(',')[0].trim() : '')
  return {
    id: p.code || String(Math.random()),
    name,
    brand: (p.brands || '').split(',')[0].trim(),
    image: p.image_url || '',
    thumb: p.image_thumb_url || p.image_url || '',
    calories: Math.round(n['energy-kcal_100g'] || n['energy-kcal'] || 0),
    protein: Math.round((n.proteins_100g || 0) * 10) / 10,
    carbs: Math.round((n.carbohydrates_100g || 0) * 10) / 10,
    fat: Math.round((n.fat_100g || 0) * 10) / 10,
    fiber: Math.round((n.fiber_100g || 0) * 10) / 10,
    sugar: Math.round((n.sugars_100g || 0) * 10) / 10,
    salt: Math.round((n.salt_100g || 0) * 100) / 100,
    saturated_fat: Math.round((n['saturated-fat_100g'] || 0) * 10) / 10,
    barcode: p.code || '',
    nutriScore: (p.nutriscore_grade || '').toUpperCase(),
    novaGroup: p.nova_group || 0,
    quantity: p.quantity || '',
    ingredients: p.ingredients_text || '',
    labels: (p.labels_tags || []).map(l => l.replace('en:','').replace('he:','')),
    countries: '',
  }
}

// ── Israeli Products Local Database ────────────────────────────────────────
// Comprehensive list of common Israeli products
const ISRAELI_DB = [
  // Dairy
  { id:'il_001', name:'גבינה לבנה 5% תנובה', name_he:'גבינה לבנה', brand:'תנובה', image:'', thumb:'', calories:75, protein:10, carbs:3.5, fat:2, fiber:0, sugar:3.5, salt:0.5, saturated_fat:1.3, barcode:'7290000063928', nutriScore:'B', novaGroup:1, quantity:'250g', ingredients:'חלב, מלח', labels:['vegetarian'], countries:'il', tags:['גבינה','חלב','דיאט'] },
  { id:'il_002', name:'קוטג׳ 5% תנובה', name_he:'קוטג׳', brand:'תנובה', image:'', thumb:'', calories:103, protein:11, carbs:3.4, fat:4.5, fiber:0, sugar:3.4, salt:0.3, saturated_fat:2.8, barcode:'7290000063935', nutriScore:'B', novaGroup:1, quantity:'250g', ingredients:'חלב, מלח', labels:['vegetarian'], countries:'il', tags:['קוטג','חלב','חלבון'] },
  { id:'il_003', name:'יוגורט 3% תנובה', name_he:'יוגורט', brand:'תנובה', image:'', thumb:'', calories:61, protein:5, carbs:4.7, fat:3.3, fiber:0, sugar:4.7, salt:0.1, saturated_fat:2.1, barcode:'7290000063942', nutriScore:'B', novaGroup:1, quantity:'200g', ingredients:'חלב מפוסטר, תרביות חיידקים', labels:['vegetarian'], countries:'il', tags:['יוגורט','חלב','פרוביוטיקה'] },
  { id:'il_004', name:'חלב 3% תנובה', name_he:'חלב', brand:'תנובה', image:'', thumb:'', calories:61, protein:3.2, carbs:4.8, fat:3.3, fiber:0, sugar:4.8, salt:0.1, saturated_fat:2.1, barcode:'7290000063959', nutriScore:'B', novaGroup:1, quantity:'1L', ingredients:'חלב מפוסטר', labels:['vegetarian'], countries:'il', tags:['חלב','שתייה','סידן'] },
  { id:'il_005', name:'שמנת חמוצה 15%', brand:'תנובה', image:'', thumb:'', calories:149, protein:3.2, carbs:3.5, fat:14, fiber:0, sugar:3.5, salt:0.1, saturated_fat:8.5, barcode:'7290000063966', nutriScore:'D', novaGroup:1, quantity:'200g', ingredients:'שמנת, תרביות', labels:['vegetarian'], countries:'il', tags:['שמנת','חלב'] },
  
  // Meat & Protein
  { id:'il_010', name:'חזה עוף טרי', name_he:'חזה עוף', brand:'עוף טוב', image:'', thumb:'', calories:165, protein:31, carbs:0, fat:3.6, fiber:0, sugar:0, salt:0.1, saturated_fat:1, barcode:'7290100100001', nutriScore:'A', novaGroup:1, quantity:'500g', ingredients:'חזה עוף', labels:['gluten-free'], countries:'il', tags:['עוף','חלבון','בשר','פרגית'] },
  { id:'il_011', name:'פרגית עוף', name_he:'פרגית', brand:'עוף טוב', image:'', thumb:'', calories:167, protein:28, carbs:0, fat:6, fiber:0, sugar:0, salt:0.1, saturated_fat:1.7, barcode:'7290100100018', nutriScore:'A', novaGroup:1, quantity:'500g', ingredients:'פרגית עוף', labels:['gluten-free'], countries:'il', tags:['עוף','פרגית','בשר'] },
  { id:'il_012', name:'בשר בקר טחון 80%', name_he:'בשר טחון', brand:'', image:'', thumb:'', calories:250, protein:26, carbs:0, fat:17, fiber:0, sugar:0, salt:0.1, saturated_fat:7, barcode:'7290100100025', nutriScore:'C', novaGroup:1, quantity:'400g', ingredients:'בשר בקר', labels:['gluten-free'], countries:'il', tags:['בקר','בשר','טחון','קציצות'] },
  { id:'il_013', name:'טונה שימורים בשמן', name_he:'טונה', brand:'סטארקיסט', image:'', thumb:'', calories:116, protein:26, carbs:0, fat:1, fiber:0, sugar:0, salt:0.5, saturated_fat:0.3, barcode:'7290100100032', nutriScore:'A', novaGroup:1, quantity:'160g', ingredients:'טונה, שמן, מלח', labels:['gluten-free'], countries:'il', tags:['טונה','שימורים','חלבון','דג'] },
  { id:'il_014', name:'סלמון טרי', brand:'', image:'', thumb:'', calories:208, protein:20, carbs:0, fat:13, fiber:0, sugar:0, salt:0.1, saturated_fat:3, barcode:'7290100100049', nutriScore:'A', novaGroup:1, quantity:'300g', ingredients:'פילה סלמון', labels:['gluten-free'], countries:'il', tags:['סלמון','דג','אומגה','חלבון'] },
  
  // Bread & Grains
  { id:'il_020', name:'לחם קל 0%', name_he:'לחם קל', brand:'ברמן', image:'', thumb:'', calories:195, protein:8, carbs:37, fat:1.5, fiber:7, sugar:2, salt:0.8, saturated_fat:0.3, barcode:'7290100200001', nutriScore:'B', novaGroup:3, quantity:'500g', ingredients:'קמח חיטה מלאה, מים, שמרים, מלח', labels:['vegan'], countries:'il', tags:['לחם','דיאט','קלוריות'] },
  { id:'il_021', name:'פיתה עברית', name_he:'פיתה', brand:'אנג׳ל', image:'', thumb:'', calories:275, protein:9, carbs:55, fat:1.2, fiber:3, sugar:2, salt:0.8, saturated_fat:0.2, barcode:'7290100200018', nutriScore:'C', novaGroup:3, quantity:'6 יחידות', ingredients:'קמח חיטה, מים, שמרים, מלח', labels:['vegan'], countries:'il', tags:['פיתה','לחם','ערבי','ממרח'] },
  { id:'il_022', name:'לחם אחיד', name_he:'לחם', brand:'אנג׳ל', image:'', thumb:'', calories:245, protein:9, carbs:47, fat:2, fiber:3, sugar:2, salt:0.8, saturated_fat:0.4, barcode:'7290100200025', nutriScore:'C', novaGroup:3, quantity:'700g', ingredients:'קמח חיטה, מים, שמרים, סוכר, שמן, מלח', labels:['vegan'], countries:'il', tags:['לחם','אחיד','טוסט'] },
  { id:'il_023', name:'אורז לבן ארוך', name_he:'אורז', brand:'שיבולת', image:'', thumb:'', calories:355, protein:7, carbs:78, fat:1, fiber:1, sugar:0, salt:0, saturated_fat:0.2, barcode:'7290100200032', nutriScore:'C', novaGroup:1, quantity:'1kg', ingredients:'אורז', labels:['vegan','gluten-free'], countries:'il', tags:['אורז','פחמימות','לבן','מנה'] },
  { id:'il_024', name:'פסטה ספגטי', brand:'אסם', image:'', thumb:'', calories:356, protein:12, carbs:72, fat:2, fiber:3, sugar:2, salt:0, saturated_fat:0.3, barcode:'7290100200049', nutriScore:'B', novaGroup:1, quantity:'500g', ingredients:'קמח חיטה, מים', labels:['vegan'], countries:'il', tags:['פסטה','ספגטי','פחמימות'] },
  { id:'il_025', name:'קוואקר שיבולת שועל', name_he:'קוואקר', brand:'תל אורן', image:'', thumb:'', calories:389, protein:17, carbs:66, fat:7, fiber:11, sugar:1, salt:0, saturated_fat:1.3, barcode:'7290100200056', nutriScore:'A', novaGroup:1, quantity:'500g', ingredients:'שיבולת שועל', labels:['vegan'], countries:'il', tags:['קוואקר','בוקר','סיבים','בריא'] },
  
  // Eggs
  { id:'il_030', name:'ביצה גדולה L', name_he:'ביצה', brand:'', image:'', thumb:'', calories:155, protein:13, carbs:1.1, fat:11, fiber:0, sugar:1, salt:0.4, saturated_fat:3.3, barcode:'7290100300001', nutriScore:'B', novaGroup:1, quantity:'12 יחידות', ingredients:'ביצת תרנגולת', labels:['vegetarian'], countries:'il', tags:['ביצה','ביצים','חלבון','בוקר'] },
  
  // Vegetables
  { id:'il_040', name:'עגבנייה', name_he:'עגבנייה', brand:'', image:'', thumb:'', calories:18, protein:0.9, carbs:3.9, fat:0.2, fiber:1.2, sugar:2.6, salt:0, saturated_fat:0, barcode:'', nutriScore:'A', novaGroup:1, quantity:'1 יחידה', ingredients:'עגבנייה', labels:['vegan','gluten-free'], countries:'il', tags:['עגבנייה','ירק','סלט','אדום'] },
  { id:'il_041', name:'מלפפון', name_he:'מלפפון', brand:'', image:'', thumb:'', calories:16, protein:0.7, carbs:3.6, fat:0.1, fiber:0.5, sugar:1.7, salt:0, saturated_fat:0, barcode:'', nutriScore:'A', novaGroup:1, quantity:'1 יחידה', ingredients:'מלפפון', labels:['vegan','gluten-free'], countries:'il', tags:['מלפפון','ירק','סלט','ירוק'] },
  { id:'il_042', name:'פלפל אדום', brand:'', image:'', thumb:'', calories:31, protein:1, carbs:6, fat:0.3, fiber:2, sugar:4.2, salt:0, saturated_fat:0, barcode:'', nutriScore:'A', novaGroup:1, quantity:'1 יחידה', ingredients:'פלפל', labels:['vegan','gluten-free'], countries:'il', tags:['פלפל','ירק','סלט','אדום'] },
  { id:'il_043', name:'בצל צהוב', brand:'', image:'', thumb:'', calories:40, protein:1.1, carbs:9.3, fat:0.1, fiber:1.7, sugar:4.2, salt:0, saturated_fat:0, barcode:'', nutriScore:'A', novaGroup:1, quantity:'1 יחידה', ingredients:'בצל', labels:['vegan','gluten-free'], countries:'il', tags:['בצל','ירק'] },
  { id:'il_044', name:'גזר', name_he:'גזר', brand:'', image:'', thumb:'', calories:41, protein:0.9, carbs:10, fat:0.2, fiber:2.8, sugar:4.7, salt:0.1, saturated_fat:0, barcode:'', nutriScore:'A', novaGroup:1, quantity:'1 יחידה', ingredients:'גזר', labels:['vegan','gluten-free'], countries:'il', tags:['גזר','ירק','כתום','בריא'] },
  { id:'il_045', name:'ברוקולי', brand:'', image:'', thumb:'', calories:34, protein:2.8, carbs:7, fat:0.4, fiber:2.6, sugar:1.7, salt:0, saturated_fat:0.1, barcode:'', nutriScore:'A', novaGroup:1, quantity:'500g', ingredients:'ברוקולי', labels:['vegan','gluten-free'], countries:'il', tags:['ברוקולי','ירק','ירוק','בריא','סיבים'] },
  { id:'il_046', name:'תרד', brand:'', image:'', thumb:'', calories:23, protein:2.9, carbs:3.6, fat:0.4, fiber:2.2, sugar:0.4, salt:0.1, saturated_fat:0.1, barcode:'', nutriScore:'A', novaGroup:1, quantity:'200g', ingredients:'תרד', labels:['vegan','gluten-free'], countries:'il', tags:['תרד','ירק','ברזל','בריא'] },
  { id:'il_047', name:'תפוח אדמה', name_he:'תפוח אדמה', brand:'', image:'', thumb:'', calories:77, protein:2, carbs:17, fat:0.1, fiber:2.2, sugar:0.8, salt:0, saturated_fat:0, barcode:'', nutriScore:'B', novaGroup:1, quantity:'1 יחידה', ingredients:'תפוח אדמה', labels:['vegan','gluten-free'], countries:'il', tags:['תפוח אדמה','פחמימות','ירק','צהוב'] },
  { id:'il_048', name:'בטטה', brand:'', image:'', thumb:'', calories:86, protein:1.6, carbs:20, fat:0.1, fiber:3, sugar:4.2, salt:0, saturated_fat:0, barcode:'', nutriScore:'A', novaGroup:1, quantity:'1 יחידה', ingredients:'בטטה', labels:['vegan','gluten-free'], countries:'il', tags:['בטטה','ירק','מתוק','כתום','סיבים'] },
  
  // Fruits
  { id:'il_050', name:'בננה', name_he:'בננה', brand:'', image:'', thumb:'', calories:89, protein:1.1, carbs:23, fat:0.3, fiber:2.6, sugar:12, salt:0, saturated_fat:0.1, barcode:'', nutriScore:'A', novaGroup:1, quantity:'1 יחידה (120g)', ingredients:'בננה', labels:['vegan','gluten-free'], countries:'il', tags:['בננה','פרי','מתוק','אשלגן'] },
  { id:'il_051', name:'תפוח', name_he:'תפוח', brand:'', image:'', thumb:'', calories:52, protein:0.3, carbs:14, fat:0.2, fiber:2.4, sugar:10, salt:0, saturated_fat:0, barcode:'', nutriScore:'A', novaGroup:1, quantity:'1 יחידה (150g)', ingredients:'תפוח', labels:['vegan','gluten-free'], countries:'il', tags:['תפוח','פרי','אדום','ירוק'] },
  { id:'il_052', name:'תפוז', name_he:'תפוז', brand:'', image:'', thumb:'', calories:47, protein:0.9, carbs:12, fat:0.1, fiber:2.4, sugar:9, salt:0, saturated_fat:0, barcode:'', nutriScore:'A', novaGroup:1, quantity:'1 יחידה (130g)', ingredients:'תפוז', labels:['vegan','gluten-free'], countries:'il', tags:['תפוז','פרי','ויטמין c','כתום'] },
  { id:'il_053', name:'אבוקדו', name_he:'אבוקדו', brand:'', image:'', thumb:'', calories:160, protein:2, carbs:9, fat:15, fiber:7, sugar:0.7, salt:0, saturated_fat:2.1, barcode:'', nutriScore:'A', novaGroup:1, quantity:'1 יחידה (150g)', ingredients:'אבוקדו', labels:['vegan','gluten-free'], countries:'il', tags:['אבוקדו','פרי','ירוק','שומן בריא','טוסט'] },
  { id:'il_054', name:'ענבים', brand:'', image:'', thumb:'', calories:69, protein:0.7, carbs:18, fat:0.2, fiber:0.9, sugar:15, salt:0, saturated_fat:0, barcode:'', nutriScore:'A', novaGroup:1, quantity:'500g', ingredients:'ענבים', labels:['vegan','gluten-free'], countries:'il', tags:['ענבים','פרי','מתוק'] },
  
  // Nuts & Seeds
  { id:'il_060', name:'שקדים', name_he:'שקדים', brand:'', image:'', thumb:'', calories:579, protein:21, carbs:22, fat:50, fiber:12.5, sugar:4.4, salt:0, saturated_fat:3.8, barcode:'', nutriScore:'A', novaGroup:1, quantity:'100g', ingredients:'שקדים', labels:['vegan','gluten-free'], countries:'il', tags:['שקדים','אגוזים','חלבון','שומן בריא','חטיף'] },
  { id:'il_061', name:'אגוזי מלך', brand:'', image:'', thumb:'', calories:654, protein:15, carbs:14, fat:65, fiber:6.7, sugar:2.6, salt:0, saturated_fat:6.1, barcode:'', nutriScore:'A', novaGroup:1, quantity:'100g', ingredients:'אגוזי מלך', labels:['vegan','gluten-free'], countries:'il', tags:['אגוזים','אומגה','שומן בריא'] },
  { id:'il_062', name:'גרעיני חמניה', brand:'', image:'', thumb:'', calories:584, protein:21, carbs:20, fat:51, fiber:8.6, sugar:2.6, salt:0, saturated_fat:5.4, barcode:'', nutriScore:'A', novaGroup:1, quantity:'100g', ingredients:'גרעיני חמניה', labels:['vegan','gluten-free'], countries:'il', tags:['גרעינים','חמניה','חטיף'] },
  { id:'il_063', name:'טחינה גולמית 100%', name_he:'טחינה', brand:'אל ארז', image:'', thumb:'', calories:592, protein:17, carbs:21, fat:54, fiber:8, sugar:0.4, salt:0.1, saturated_fat:7.6, barcode:'7290100600001', nutriScore:'B', novaGroup:1, quantity:'500g', ingredients:'שומשום', labels:['vegan','gluten-free'], countries:'il', tags:['טחינה','ממרח','שומשום','ערבי'] },
  { id:'il_064', name:'חומוס מבושל', name_he:'חומוס', brand:'', image:'', thumb:'', calories:164, protein:8.9, carbs:27, fat:2.6, fiber:7.6, sugar:4.8, salt:0.6, saturated_fat:0.3, barcode:'', nutriScore:'A', novaGroup:1, quantity:'400g', ingredients:'חומוס, מים, מלח', labels:['vegan','gluten-free'], countries:'il', tags:['חומוס','קטנית','חלבון','ממרח'] },
  
  // Spreads
  { id:'il_070', name:'גבינה צהובה אמנטל 28%', brand:'תנובה', image:'', thumb:'', calories:392, protein:28, carbs:0, fat:31, fiber:0, sugar:0, salt:0.6, saturated_fat:19, barcode:'7290100700001', nutriScore:'C', novaGroup:1, quantity:'200g', ingredients:'חלב, מלח, תרביות', labels:['vegetarian'], countries:'il', tags:['גבינה','צהובה','אמנטל','חלב'] },
  { id:'il_071', name:'חמאה', brand:'תנובה', image:'', thumb:'', calories:717, protein:0.9, carbs:0.1, fat:81, fiber:0, sugar:0.1, salt:0.8, saturated_fat:51, barcode:'7290100700018', nutriScore:'E', novaGroup:2, quantity:'250g', ingredients:'שמנת, מלח', labels:['vegetarian'], countries:'il', tags:['חמאה','שומן','ממרח','אפייה'] },
  { id:'il_072', name:'שמן זית כתית מעולה', name_he:'שמן זית', brand:'ברקן', image:'', thumb:'', calories:884, protein:0, carbs:0, fat:100, fiber:0, sugar:0, salt:0, saturated_fat:14, barcode:'7290100700025', nutriScore:'B', novaGroup:1, quantity:'750ml', ingredients:'שמן זית', labels:['vegan','gluten-free'], countries:'il', tags:['שמן זית','בישול','בריא','שומן'] },
  
  // Ready meals & proteins
  { id:'il_080', name:'ביצה קשה', name_he:'ביצה קשה', brand:'', image:'', thumb:'', calories:155, protein:13, carbs:1.1, fat:11, fiber:0, sugar:0, salt:0.4, saturated_fat:3.3, barcode:'', nutriScore:'B', novaGroup:1, quantity:'1 יחידה', ingredients:'ביצה', labels:['vegetarian'], countries:'il', tags:['ביצה','קשה','חלבון','ארוחה'] },
  { id:'il_081', name:'שניצל עוף מוכן', brand:'', image:'', thumb:'', calories:244, protein:22, carbs:14, fat:11, fiber:0.8, sugar:0.5, salt:0.9, saturated_fat:1.8, barcode:'', nutriScore:'C', novaGroup:3, quantity:'200g', ingredients:'חזה עוף, לחם פירורים, ביצה, שמן', labels:[], countries:'il', tags:['שניצל','עוף','מטוגן','מוכן'] },
  
  // Israeli specific
  { id:'il_090', name:'לאפה ארמנית', brand:'', image:'', thumb:'', calories:290, protein:9, carbs:60, fat:2, fiber:2, sugar:2, salt:0.8, saturated_fat:0.3, barcode:'', nutriScore:'C', novaGroup:3, quantity:'1 יחידה', ingredients:'קמח, מים, שמרים, מלח', labels:['vegan'], countries:'il', tags:['לאפה','לחם','ארמני','ממרח'] },
  { id:'il_091', name:'פלאפל ביתי', brand:'', image:'', thumb:'', calories:333, protein:13, carbs:32, fat:17, fiber:7, sugar:1.5, salt:0.8, saturated_fat:2.3, barcode:'', nutriScore:'B', novaGroup:3, quantity:'5 כדורים', ingredients:'חומוס, תבלינים, שמן', labels:['vegan'], countries:'il', tags:['פלאפל','חומוס','מטוגן','ישראלי'] },
  { id:'il_092', name:'שווארמה עוף', brand:'', image:'', thumb:'', calories:195, protein:22, carbs:3, fat:10, fiber:0, sugar:1, salt:0.9, saturated_fat:2.5, barcode:'', nutriScore:'B', novaGroup:3, quantity:'100g', ingredients:'עוף, תבלינים', labels:[], countries:'il', tags:['שווארמה','עוף','ישראלי'] },
  { id:'il_093', name:'ממרח חומוס', name_he:'ממרח חומוס', brand:'סאבבה', image:'', thumb:'', calories:170, protein:8, carbs:16, fat:8, fiber:5, sugar:1, salt:0.8, saturated_fat:1.2, barcode:'7290100900001', nutriScore:'A', novaGroup:2, quantity:'400g', ingredients:'חומוס, טחינה, לימון, שום', labels:['vegan','gluten-free'], countries:'il', tags:['חומוס','ממרח','ישראלי','ערבי'] },
  
  // Popular Israeli brands
  { id:'il_100', name:'במבה 80g', name_he:'במבה', brand:'אסם', image:'', thumb:'', calories:567, protein:13, carbs:57, fat:31, fiber:3, sugar:3, salt:0.5, saturated_fat:5, barcode:'7290000066257', nutriScore:'D', novaGroup:4, quantity:'80g', ingredients:'קמח תירס, שמן, ממרח בוטנים, מלח', labels:[], countries:'il', tags:['במבה','חטיף','ילדים','בוטנים'] },
  { id:'il_101', name:'ביסלי גריל', name_he:'ביסלי', brand:'אסם', image:'', thumb:'', calories:475, protein:7, carbs:68, fat:19, fiber:3, sugar:3, salt:1.2, saturated_fat:2, barcode:'7290000066264', nutriScore:'D', novaGroup:4, quantity:'70g', ingredients:'קמח חיטה, שמן, תבלינים', labels:[], countries:'il', tags:['ביסלי','חטיף','גריל','ילדים'] },
  { id:'il_102', name:'פריגת 1L', name_he:'מיץ פריגת', brand:'פריגת', image:'', thumb:'', calories:46, protein:0.4, carbs:11, fat:0, fiber:0, sugar:10, salt:0, saturated_fat:0, barcode:'7290000068312', nutriScore:'C', novaGroup:3, quantity:'1L', ingredients:'מים, סוכר, מיץ פירות, ויטמין C', labels:['vegan'], countries:'il', tags:['פריגת','מיץ','שתייה','פירות'] },
  { id:'il_103', name:'מלוחים תוצרת הבית', name_he:'מלוחים', brand:'', image:'', thumb:'', calories:417, protein:11, carbs:65, fat:12, fiber:3, sugar:2, salt:2.1, saturated_fat:2, barcode:'', nutriScore:'D', novaGroup:3, quantity:'100g', ingredients:'קמח חיטה, שמן, מלח', labels:['vegan'], countries:'il', tags:['מלוחים','ביסקוויט','מלוח','חטיף'] },
  
  // Protein supplements
  { id:'il_110', name:'אבקת חלבון וואנילה', name_he:'אבקת חלבון', brand:'', image:'', thumb:'', calories:379, protein:75, carbs:10, fat:5, fiber:2, sugar:4, salt:0.5, saturated_fat:1.5, barcode:'', nutriScore:'B', novaGroup:4, quantity:'1kg', ingredients:'חלבון מי גבינה, סוכרין, תמצית וניל', labels:['vegetarian'], countries:'il', tags:['חלבון','אבקה','ספורט','gym','שייק'] },
  { id:'il_111', name:'חטיף חלבון שוקולד', brand:'', image:'', thumb:'', calories:371, protein:32, carbs:33, fat:12, fiber:4, sugar:12, salt:0.3, saturated_fat:5, barcode:'', nutriScore:'C', novaGroup:4, quantity:'60g', ingredients:'חלבון, שוקולד, שיבולת שועל', labels:[], countries:'il', tags:['חלבון','חטיף','שוקולד','ספורט'] },
]
