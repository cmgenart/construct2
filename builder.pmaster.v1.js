// PROP MASTER v2 
/*
Properties with optional json settings
	RegEx:
		/(\/?\/\*#)\s*?<([a-zA-Z0-9_\s]*):([a-zA-Z0-9_\s]*)>[^\S\r\n]*({.*})?/gm
	
	comment
		|
		|	property
		|    |
		|    |     property value
		|    |       |
		|    |       |              Json blob (for extra options)
		|    |       |                 |
		/*# <Form:probabilityTest2> {prob:2, max:5}

		end brace for a property
		//#*/  

function PM_DoInserts(code, insertLineNumbers, onInsert)
{	
	let rx = /\/\/insert<(.*)>/gm
	let rxGet = /\/\/insert<(.*)>/
	let insertMatches = code.match(rx)
	if (insertMatches) {
		insertMatches.forEach(m=>{				
			var mat = m.match(rxGet)
			var name = mat[1]
			var rxStart = new RegExp(`\\/\\/insert<${name}>`,"gm")
			var rxEnd = new RegExp(`\\/\\/end<${name}>`,"gm")
			var ends = code.match(rxEnd) || []
			var rxContent = new RegExp(`\\/\\/insert<${name}>([\\S\\s]*?)\\/\\/end<${name}>`,"gm")
			var content = code.match(rxContent).join()
			//content = content.replace(rxEnd,'')
			//content = content.replace(rxStart,'')
			//console.log(content)
			
			//MH when replacing inserts, set the line numbers of insert sections
			if (insertLineNumbers != null)
			{
				insertLineNumbers.push(code.substring(0,code.indexOf(code.match(rxContent)[0])).split('\n').length);
			}
			
			// var insertContent = `//insert<${name}>\n`+onInsert(name, content)+`\n//end<${name}>`
			var insertContent = onInsert(name, content)
			code = code.replace(rxContent, insertContent)
			//content.forEach(e=>console.log(e))
			//console.log(content)
		})
	}
	return code
}

function PM_GetInserts(code)
{	
	let rx = /\/\/insert<(.*)>/gm
	let rxGet = /\/\/insert<(.*)>/
	let insertMatches = code.match(rx)
	let inserts = [];
	if (insertMatches) {
		insertMatches.forEach(m=>{				
			var mat = m.match(rxGet)
			var name = mat[1]
			var rxStart = new RegExp(`\\/\\/insert<${name}>`,"gm")
			var rxEnd = new RegExp(`\\/\\/end<${name}>`,"gm")
			var ends = code.match(rxEnd) || []
			var rxContent = new RegExp(`\\/\\/insert<${name}>([\\S\\s]*?)\\/\\/end<${name}>`,"gm")
			var content = code.match(rxContent).join()
			content = content.replace(rxEnd,'')
			content = content.replace(rxStart,'')						
			inserts.push({
				key: name,
				value: content
			});			
		})
	}
	return inserts
}

function PM_CollectProcessTags(code)
{	
	// collect the first part of the tags
	let rx = new RegExp(`\\/\\/PROCESS<([a-zA-Z0-9]*)>`,"gm")//[\\S\\s]*?\\/\\/PROCESS_END<${tag}`, "gm")
	let matches = code.match(rx) || []
	let tags = {}
	matches.forEach(m=>{
		//console.log(m)
		let rx_ex = new RegExp(`\\/\\/PROCESS<([a-zA-Z0-9]*)>`,"")
		let mat = m.match(rx_ex)
		///console.log(mat)
		var tag = mat[1]
		tags[tag] = tags[tag] ? tags[tag]+1 : 1
	}) 
	return tags		


	// itterate the results and collect the end brace for each tag
}

function PM_GetTaggedCodeBlocks(code, tag)
{	
	let rx = new RegExp(`\\/\\/PROCESS<${tag}>[\\S\\s.]*?\\/\\/PROCESS_END<${tag}>`, "gm")
	let matches = code.match(rx) || []
	return matches
}
function PM_InsertTaggedCodeBlocks(code, tag, codeBlocks)
{
	let rx_cnt = new RegExp(`\\/\\/PROCESS<${tag}>`, "gm")
	let matches_cnt = code.match(rx_cnt)
	for (var n=0;n<matches_cnt.length;n++){
		code = code.replace(`\/\/PROCESS<${tag}>`, `\/\/PROCESS<${tag}${n}>`)
		code = code.replace(`\/\/PROCESS_END<${tag}>`, `\/\/PROCESS_END<${tag}${n}>`)
		
		//MJH replaced regex with index replacement, to allow for large files
		//let rx = new RegExp(`\\/\\/PROCESS<${tag}${n}>[\\S\\s.]*?\\/\\/PROCESS_END<${tag}${n}>`, "gm")		
		//code = code.replace(rx, codeBlocks[n])

		let startInd = code.indexOf(`//PROCESS<${tag}${n}>`);
		let endInd = code.indexOf(`//PROCESS_END<${tag}${n}>`) + 15 + tag.length + n.toString().length;
		let replaced_code = code.substring(0,startInd);
		replaced_code += codeBlocks[n];
		replaced_code += code.substring(endInd);
		code = replaced_code;
	}
	return code
}

function PM_DoIncludes(code, onInclude)
{
	let rx = /\/\/include<(.*?)>/gm
	let matchFound = true
	while(matchFound) {
		// keeps looping until no new matches exist
		// because includes can contain new includes
		matchFound = false
		let includeMatches = code.match(rx) || []
		includeMatches.forEach(m=>{					
			//let grps = m.match(/<(.*?)>/)
			let name = m.match(/<(.*?)>/)[1]
			code = code.replace(m, onInclude(name))
			matchFound = true
		})
	}
	return code
}

function PM_DoImports(code, onImport)
{
	let rx = /\/\/import<(.*?)>/gm
	let matchFound = true
	while(matchFound) {
		matchFound = false
		let importMatches = code.match(rx) || []
		importMatches.forEach(m=>{
			let name = m.match(/<(.*?)>/)[1]
			code = code.replace(m, onImport(name))
			matchFound = true
		})
	}
	return code
}

function PM_DoProperties(code, ifProperty)
{
	// process the properties
	let rxMatchAll = /(\/?\/\*#)\s*?<([a-zA-Z0-9_\s]*):([a-zA-Z0-9_\s]*)>[^\S\r\n]*({.*})?/gm
	let rxExtractProps = /(\/?\/\*#)\s*?<([a-zA-Z0-9_\s]*):([a-zA-Z0-9_\s]*)>[^\S\r\n]*({.*})?/
	let propMatches = code.match( rxMatchAll ) || []
	propMatches.forEach(m=>{
		let grp = m.match(rxExtractProps)
		let state = grp[1].includes("//*#")
		let key = grp[2]
		let val = grp[3]
		let json = grp[4]
		let result = ifProperty(key, val, state, json)
		if (result != state) {
			// then set its state in the code!
			let rxSetProp = new RegExp(`\\/?/\\*#\\s*?<${ key }:${ val }>`, "gm")
			let comment = result ? `//*#` : `/*#`
			//console.log("comment:",comment)
			//console.log("rxSetProp:",rxSetProp)
			let test = code.replace(rxSetProp, `${comment} <${key}:${val}>`)
			//if (test==code) {
			//	console.log("Error parameter did not set")
			//}
			code = code.replace(rxSetProp, `${comment} <${key}:${val}>`)
		}
	})
	return code
}


function PM_DoProperties2(code, ifProperty)
{
	// process the properties
	let rxMatchAll = /(\/?\/\*#).?<([a-zA-Z0-9]*):([a-zA-Z0-9]*)>/gm  
	let rxExtractProps = /(\/?\/\*#).?<([a-zA-Z0-9]*):([a-zA-Z0-9]*)>/
	let propMatches = code.match( rxMatchAll ) || []
	propMatches.forEach(m=>{
		let grp = m.match(rxExtractProps)
		let state = grp[1].includes("//*#")
		let key = grp[2]
		let val = grp[3]
		let result = ifProperty(key, val, state)
		if (result != state) {
			// then set its state in the code!
			let rxSetProp = new RegExp(`\\/?/\\*#.?<${ key }:${ val }>`, "gm")
			let comment = result ? `//*#` : `/*#`
			//console.log(comment)
			//console.log(rxSetProp)
			let test = code.replace(rxSetProp, `${comment} <${key}:${val}>`)
			//if (test==code) {
			//	console.log("Error parameter did not set")
			//}
			code = code.replace(rxSetProp, `${comment} <${key}:${val}>`)
		}
	})
	return code
}

function PM_DoDirectives(code, ifDirective)
{
	// process all the eval directives
	let rxMatchDirective = /\/?\/\*#IF.*?\[(.*)\]/gm
	let rxMatchDirectiveEx = /\/?\/\*#IF.*?\[(.*)\]/
	let directiveMatches = code.match( rxMatchDirective ) || []
	directiveMatches.forEach(m=>{
		//console.log(m)
		let res = m.match( rxMatchDirectiveEx )
		//console.log(res)	
		var dirResult = ifDirective(res[1])
		let comment = dirResult ? `//*#` : `/*#`
		let rxIF = new RegExp(`\\/?/\\*#IF.*?\\[${res[1]}\\]`, 'gm')
		//console.log(rxIF)
		let repLine = `${comment}IF[${res[1]}]`
		//console.log(repLine)
		code = code.replace(rxIF, repLine)
	})
	return code
}

function PM_DoValueInserts(code, onValExpr)
{
	// process all the eval directives
	let rxMatchVal = /[0-9]*?\/\*?\[(.*?)\]\*?\//gm
	let rxMatchValEx = /[0-9]*?\/\*?\[(.*?)\]\*?\//
	let valMatches = code.match( rxMatchVal ) || []
	valMatches.forEach(m=>{
		let res = m.match( rxMatchValEx )
		var valResult = onValExpr(res[1])	

		//console.log(`replace(${res[0]}, ${valResult})`)
		code = code.replace(res[0], valResult!=null ? valResult : m)
	})
	return code
}

class RNG 
{
    constructor(s) {
      var 
        t = this,
        a = 4294967295, 
        b = 123456789 + s & a, 
        r = 987654321 - s & a,  
        c = 65535

      t.r = x => {
          r = 36969 * (r & c) + (r >>> 16) & a, 
          b = 18e3  * (b & c) + (b >>> 16) & a
          return ((r << 16) + (b & c) >>> 0) / (a + 1)
      }
      t.f    = (l,h) => l + t.r() * (h - l)
      t.fr   = r     => t.f(r[0], r[1])
      t.i    = (l,h) => Math.floor( t.f(l, h))
      t.ir   = r     => t.i(r[0], r[1] + 1)
      t.c    = c     => t.r() < c
      t.flip = x     => t.c(x||0.5) ? -1 : 1
      t.item = l     => l[ t.i(0, l.length) ]
    }
}

function Inner_PM_GenerateRandomProperties(property_template, piece_seed)//, existingPropertiesArray)
{
	var RN = new RNG(piece_seed)
	var result = {}
	// each property value needs a probability
	// those probabilities are added up and 1/total 
	// this gives a probability normalisation value
	// each prob is then multiplied by the normalisation value

	var probabilities = {/*
		"Colour" : {
			"red":1,
			"blue":2,
			"green":3
		},
		"style"	 :{
			"spicy":2,
			"cold":2,
			"squiggly":1,
		}
	*/}
	
	for (const [prop_name, list] of Object.entries(property_template.all)) {

		// skip hidden properties
		if (prop_name.toLowerCase().includes("hidden_"))
			continue
			
		probabilities[prop_name] = {}
		var options = property_template.options[prop_name] 
		var probTotal = 0
		//var probCount = 0
		
		// set up the probabilities for the values on this property
		list.forEach(prop_value=>{
			var opts = options[prop_value] ? options[prop_value] : {}
			var prob = opts.prob ? opts.prob : 1
			probabilities[prop_name][prop_value] = prob
			probTotal += probabilities[prop_name][prop_value]
		})

		var normaliser = 1/probTotal
		var r = RN.f(0, 1)  			// random 0-1 float to select prop value
		
		// now we have the normalised probabilities we can randomly assign 
		// a value to this property 		
		var accum = 0
		list.forEach(prop_value=>{
			// normalised probability value
			var prob = probabilities[prop_name][prop_value] * normaliser

			// is the value in this portion of the prob spectrum
			if (!result[prop_name] && r>=accum && r<accum+prob) {
				result[prop_name] = prop_value
			}

			// accumulate the probabilities so far
			accum += prob
		})
		if (!result[prop_name])
			console.log("Something went wrong selecting property: "+prop_name)
	}
	return result
}

function PM_RemoveHiddenProperties(properties) {
	var result = {}
	for (const [key, value] of Object.entries(properties)) {
		var key_hidden = key.toLowerCase().includes("hidden_")
		var value_hidden = value.toLowerCase().includes("hidden_")
		if (key_hidden || value_hidden) {
			continue
		}
		else{
			result[key]=value
		}
	}
	return result
}

function PM_GenerateRandomProperties(property_template, piece, existingPropertiesArray, duplicatepropsallowed)
// property_template: is a subpart of what the PMaster object returns for 
// 				      the <PMaster>.generateTemplate() function (template.properties)
//        piece: the piece containing the seed used in the art creation process
//     existing_uses: is a key/value object with [prop][value] = occurances of that value
//      		      {'Colour': { 'red':2, 'blue':4, 'gold':2 }}
{
	var max_attempts = 100
	var attempt = 0
	var result;

	if (!duplicatepropsallowed)
	{
		for(attempt=0; attempt<max_attempts; attempt++){
			result = Inner_PM_GenerateRandomProperties(property_template, piece.seed)
					
			// check through all existing piece properties for a clash
			for(var n=0; n<existingPropertiesArray.length; n++){
				var existing = existingPropertiesArray[n]
				var clash = true

				// loop through all properties and set clash to false if any entry is differnt
				for (const [key, value] of Object.entries(result)) {
					if (key.toLowerCase().includes("hidden_")){
						continue
					}
					else if (existing[key] != value) {
						clash = false
					}
				}

				// exit loop early if theres a clash (no need to search further)
				if (clash) 
					break;
			}		
			if (clash){
				// if clash then incriment the piece seed and try again
				piece.seed++
				// MJH when this clash happens, we need to return the new seed so I can save it in the properties
				console.log("incremented seed due to clash, now " + piece.seed);
			}
			else {
				//we should add the existing properties to the array, so that we won't just generate the same one next time!
				existingPropertiesArray.push(result);
				// if no clash then its all good and we can break!
				break;
			}		
		}
		if (attempt==max_attempts)
		{
			//console.log(`Warning: Tried ${max_attempts} times and properties still clash.  Using the last clashed properties attempt result.`)
			console.log(`Error: Tried ${max_attempts} times and properties still clash.  Will not generate a piece.`)
			piece.seed = null;
		}
		else if (attempt>0){
			console.log(`Warning: Tried ${attempt} times and got a unique property configuration`)
		}
	}
	else
	{
		result = Inner_PM_GenerateRandomProperties(property_template, piece.seed)
	}
	return result
}

// CODE FOR TESTING THE RANDOM DISTRIB
// for (var seed=0; seed<100; seed+=3){
// 	var propTemplate = {
// 	 	all:    { 
// 			colour: ['red', 'green', 'blue'] 
// 		},
// 	 	options:    { 
// 	 		colour: {
// 				red:{prob:2},
// 				green:{prob:5},
// 	 			blue:{prob:1},
// 	 		}
// 	 	},
// 	 	active: { colour: 'red' }
// 	 }
// 	console.log("seed",seed)
// 	console.log(PM_GenerateRandomProperties(propTemplate, seed, {}))
// }

class PMaster 
{
	constructor(code)
	{
		this.source = code
		this.code = code
		this.insertLineNumbers = []
		this.template = this.generateTemplate()
		this.properties = this.template.properties
	}

	replaceInserts(onInsert) // onInsert( <field>, <default> ) => <insert string>
	{
		this.code = PM_DoInserts(this.code, this.insertLineNumbers, onInsert)
	}

	removeBlankLines()
	{
		this.code = this.code.replace(/^\s*\n/gm, "")
		this.code = this.code.replace(/(\r\n|\n|\r)/gm, "");
	}	

	// generic minify function (could replace the uglify one below too)
	minify(tag, onMinify) // onMinify( <code> ) => minified code to replace the existing block
	{
		var codetominify = this.getTagCode(tag)
		if (codetominify && codetominify.length>0) {
			var minified = []
			codetominify.forEach(codeBlock=>{
				minified.push( onMinify(codeBlock) )
			})				
			this.insertTagCode(tag, minified)		
		}
		else{
			console.log(`No '${tag}' codeblocks to minify`)
		}
		return this
	}

	processProperties(onProperty) // onProperty( <property>, <value>, <state> ) => <true|false> 
	{
		this.code = PM_DoProperties(this.code, onProperty)
	}

	processDirectives(onDirective) // onDirective( <expr> ) => true|false
	{
		this.code = PM_DoDirectives(this.code, onDirective)
	}
	
	processValueInserts(onValInsert) // onValInsert( <expr> ) => "replace string"
	{
		this.code = PM_DoValueInserts(this.code, onValInsert)
	}

	processIncludes(onInclude)
	{
		this.code = PM_DoIncludes(this.code, onInclude)
	}

	processImports(onImport)
	{
		this.code = PM_DoImports(this.code, onImport)
	}
	
	getTagCode(tag)
	{
		// returns array of those tagged codeblocks
		return PM_GetTaggedCodeBlocks(this.code, tag)
	}

	insertTagCode(tag, codeBlocks)
	{
		this.code = PM_InsertTaggedCodeBlocks(this.code, tag, codeBlocks)
	}

	getResult()
	{		
		this.code = this.code.replaceAll('"', `'`) //update all double quotes to single quotes for blockchain compatibility				
		return this.code;
	}

	generateTemplate()
	{
		var template = {
			properties : this.getProperties(),
			/*{
				all:    { <property>: [<choice>, <choice>, <choice>] },
				options:    { 
					<property>: {
						<choice>:<json>, 
						<choice>:<json>, 
						<choice>:<json>, 
					}
				},
				active: { <property>: <choice> }
				//options: { <property> <choice> <options> }
			}*/
			inserts: [
			/*
				{ name: "setup", default: "the code" },
				{ name: "draw", default: "the code" },
				{ name: "cert", default: "the code" }
			*/
			],
			values: [],//"values", "value expression", "etc..."],
			directives: [],//"directive", "directive expression", "etc..."],		
			tags: PM_CollectProcessTags(this.code),		
		}		
		PM_DoInserts(this.code, null, (field, defaultContent)=>{
			template.inserts.push({
				name:field,
				default:defaultContent,
			})
			return defaultContent
		})
		PM_DoValueInserts(this.code, (expr)=>{
			template.values.push(expr)
			return "X"
		})
		PM_DoDirectives(this.code, (expr)=>{ 
			template.directives.push(expr)
			return true; 
		})
		PM_GetTaggedCodeBlocks(this.code, "minify")
		return template
	}
	getRandomProperties(piece, existingPropertiesArray, duplicatepropsallowed = false) // existingPropertiesArray contains an array of all existing artpiece properties
	{
		return PM_GenerateRandomProperties(this.generateTemplate().properties, piece, existingPropertiesArray, duplicatepropsallowed??false)
	}
	removeHiddenProperties(properties)
	{
		return PM_RemoveHiddenProperties(properties)
	}
	getProperties()
	{
		var properties = {
			all: {},      // properties with all avalible options for each
			options: {},  // the extra option blocks for each property
			active: {},   // the properties selected for the piece
			visible: {},  // the visible properties (the none "hidden_")
			has_properties: false, // if it has any visible properties
		}
		this.properties = properties
		PM_DoProperties(this.code, 
			(prop, value, isActive, jsonOptions)=>{
				if (isActive) {
					properties.active[prop] = value
					if (!(prop.includes("hidden_") || value.includes("hidden_"))) {
						properties.has_properties = true
						properties.visible[prop] = value
					}
				}
				if (!properties.all[prop])
					properties.all[prop] = []


				if (!properties.options[prop])
					properties.options[prop] = {}

				var opts = {prob:1}
				try{
					if (jsonOptions){
						opts = JSON.parse(jsonOptions)
					}						
				}
				catch (ex) {
					console.log(`[PMaster] Error: Unable to parse json options for property ${prop}:${value} JSON:${jsonOptions}`)
				}
				properties.options[prop][value] = opts//jsonOptions || `{"prob":1}`

				if (!properties.all[prop].includes(value)){
					properties.all[prop].push(value)
				}
				return isActive
			})
		return properties
	}
}

try {
	module.exports = {
		PMaster: PMaster,
		PM_DoProperties: PM_DoProperties,
		PM_DoValueInserts: PM_DoValueInserts,
		PM_GenerateRandomProperties: PM_GenerateRandomProperties,
		PM_RemoveHiddenProperties: PM_RemoveHiddenProperties,
	}	
} catch (error) {
	//website doesn't understand exports, just swallow the error
}
