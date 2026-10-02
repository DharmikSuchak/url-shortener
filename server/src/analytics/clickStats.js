const Click=require('../models/click');

async function getClickStats(urlId) {
    const [result]=await Click.aggregate([
        {$match:{urlId}},
        {$facet:{
            totals:[{$group:{_id:null,totalClicks:{$sum:1},lastClickedAt:{$max:"$timestamp"}}}],
            clicksByDay:[
                {$group:{
                    _id:{$dateToString:{format:"%Y-%m-%d",date:"$timestamp",timezone:"UTC"}},
                    count:{$sum:1}
                }},
                {$sort:{_id:1}},
                {$project:{_id:0,date:"$_id",count:1}}
            ],
            recentClicks:[
                {$sort:{timestamp:-1,_id:-1}},
                {$limit:20},
                {$project:{_id:0,code:1,timestamp:1,userAgent:1,referrer:1}}
            ]
        }}
    ]);

    return {
        totalClicks:result.totals[0]?.totalClicks || 0,
        lastClickedAt:result.totals[0]?.lastClickedAt || null,
        clicksByDay:result.clicksByDay,
        recentClicks:result.recentClicks
    };
}

module.exports=getClickStats;
