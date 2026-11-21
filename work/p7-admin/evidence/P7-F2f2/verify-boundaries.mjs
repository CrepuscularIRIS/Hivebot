import { authorize as head } from './verify-runtime/project/app/sdk/src/admin/authority.mjs'
import { authorize as base } from './verify-base-authority.mjs'
const quote='rename bot-22 to Alice; "example; rename bot-22 to Mallory; end example"'
const inputs=[
 {turnClass:'user',action:'modify',target:'bot-22',humanUtteranceOfGrant:quote,params:{name:'Alice'}},
 {turnClass:'user',action:'modify',target:'bot-22',humanUtteranceOfGrant:quote,params:{name:'Mallory'}},
 {turnClass:'user',action:'modify',target:'bot-22',humanUtteranceOfGrant:'rename bot-22 to Alice',params:{name:'Mallory'}},
 ...['install gh-x; disable gh-y','install gh-x and disable gh-y','install gh-x then disable gh-y'].flatMap(text=>['install','disable'].flatMap(action=>['gh-x','gh-y'].map(target=>({turnClass:'delegated',action,target,mandate:{actions:['install','disable'],scopes:{plugins:['gh-x','gh-y']},grantUtterance:text}}))))
]
for(const input of inputs) console.log(JSON.stringify({input,baseline:base(input),fixed:head(input)}))
