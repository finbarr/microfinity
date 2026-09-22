export type RatingSummary={average:number;count:number;rank:number};
/** Five neutral votes keep one enthusiastic vote from dominating an established favourite. */
export function summarizeRating(total:number,count:number):RatingSummary{
  return {average:count?total/count:0,count,rank:count?(total+15)/(count+5):0};
}
export function compareRatings(a?:RatingSummary,b?:RatingSummary){
  return (b?.rank??0)-(a?.rank??0)||(b?.count??0)-(a?.count??0)||(b?.average??0)-(a?.average??0);
}
