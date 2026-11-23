// First-pass associations reviewed with the owner. Only classification metadata
// lives here: the essay, correction and explanation always come from current data.
export interface ReviewedTemplateSelection {
 reviewId:string; needle:string; templateId:string; reminder?:boolean; source?:string;
}
const entry=(suffix:string)=>'doc-20261103-s-'+suffix;
const rows:[string,string,string,boolean?,string?][]=[
 ['1bfacee2-eeea-44a6-a9cf-6f5c5f24ba8f','In the picture','ed8a0b924e2d5816b9'],
 ['1bfacee2-eeea-44a6-a9cf-6f5c5f24ba8f','Central to her achievements','e5138a9e15188803db'],
 ['1bfacee2-eeea-44a6-a9cf-6f5c5f24ba8f','Yet in reality','320e047b9eeb41f4d3',true],
 ['1bfacee2-eeea-44a6-a9cf-6f5c5f24ba8f','tackle manufacturing challenges','43bb1fab37d02770b4',true,'This is well exemplified'],
 ['d533f47a-706d-4641-a706-69c811b24c64','In the picture','1636d121d04f0e49e9'],
 ['d533f47a-706d-4641-a706-69c811b24c64','Beneath the surface','a3e46c35c142f86790'],
 ['d533f47a-706d-4641-a706-69c811b24c64','Finally','4cc6795c1d4a29b66f'],
 ['d533f47a-706d-4641-a706-69c811b24c64','In a larger sense','96be04b0649f781952'],
 ['145e952c-4f7d-41da-ba0c-0c516fc05159','In the left picture','f8052d360503524463'],
 ['145e952c-4f7d-41da-ba0c-0c516fc05159','In a larger sense','96be04b0649f781952'],
 ['145e952c-4f7d-41da-ba0c-0c516fc05159','Such sustained efforts','af0ca5d692aa33fe86',true],
 ['2476d967-dd8e-47c6-817e-a31ae075347c','The table offers','911a5e3c4a6beea9b5'],
 ['2476d967-dd8e-47c6-817e-a31ae075347c','First','41716eee81efdaa513'],
 ['2476d967-dd8e-47c6-817e-a31ae075347c','China is riding','b075acc91368903fc3'],
 ['94c8799f-7ec3-4b89-bb81-e8e3cb948e3a','The column chart','911a5e3c4a6beea9b5'],
 ['94c8799f-7ec3-4b89-bb81-e8e3cb948e3a','This follows','0f495f20a22030b2fb'],
 ['94c8799f-7ec3-4b89-bb81-e8e3cb948e3a','enhancing parent-children','2a58cae9eaa7871c88'],
 ['94c8799f-7ec3-4b89-bb81-e8e3cb948e3a','First','fdbd95322cb504a17c'],
 ['94c8799f-7ec3-4b89-bb81-e8e3cb948e3a','Second','06ab746d7fc6ec021e'],
 ['94c8799f-7ec3-4b89-bb81-e8e3cb948e3a','媒体传播这一原因','4cc6795c1d4a29b66f',true,'Third, media coverage'],
 ['94c8799f-7ec3-4b89-bb81-e8e3cb948e3a','结尾的预测句','d672885a8b2f81fb61',true,'This phenomenon'],
 ['9baa53b8-2f90-40c8-ac5f-26ff2cca72ce','Beneath the surface','595cfe54c79f69ba00'],
 ['9baa53b8-2f90-40c8-ac5f-26ff2cca72ce','Moreover','cc09fbb1511faa151e'],
 ['9baa53b8-2f90-40c8-ac5f-26ff2cca72ce','Communicating uncertainty','96be04b0649f781952'],
 ['9baa53b8-2f90-40c8-ac5f-26ff2cca72ce','Such a sincere attitude','af0ca5d692aa33fe86'],
 ['9baa53b8-2f90-40c8-ac5f-26ff2cca72ce','There are two determinants','b06a5caa122c3656bf',true,'There are two determinants'],
 ['b9af62be-6c37-40b0-9dee-af27f660bc2a','It is with great pleasure','bc2e2d728edf80d58c'],
 ['c1301b03-7bde-4e1a-bc12-ad23306bb5c4','Given your expertise','6ce90bfb27f8ecbc6c'],
 ['c1301b03-7bde-4e1a-bc12-ad23306bb5c4','Designed to','501672c8cd79d508cf'],
 ['c1301b03-7bde-4e1a-bc12-ad23306bb5c4','I would appreciate','86fb89f7cedb88b21d'],
 ['c1301b03-7bde-4e1a-bc12-ad23306bb5c4','confirm your availability','86fb89f7cedb88b21d',true,'I would appreciate'],
];
export const reviewedTemplateSelections:ReviewedTemplateSelection[]=rows.map(([reviewId,needle,suffix,reminder,source])=>({reviewId,needle,templateId:entry(suffix),reminder,source}));
