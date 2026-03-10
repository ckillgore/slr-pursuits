const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fs = require('fs');
async function main() {
    const { data, error } = await supabase
        .from('pursuit_checklist_phases')
        .select(`*, pursuit_checklist_tasks(*)`)
        .limit(1);
    
    if (error) {
        console.error('Error:', error);
    } else {
        const resultData = data[0];
        fs.writeFileSync('result.json', JSON.stringify({ keys: Object.keys(resultData), data: resultData }, null, 2));
    }
}

main();
