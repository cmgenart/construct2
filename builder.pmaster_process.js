//const PropMaster_v2 = require("./PropMaster_v2")
const path = require("path");
const PMasterV2 = require("./builder.pmaster.v2.js");
const { expandProjectSources } = require("./import_resolve.js");

function resolveProjectRoot(project) {
    if (project && project.path) {
        return path.isAbsolute(project.path)
            ? project.path
            : path.resolve(__dirname, project.path);
    }
    if (project && project.name) {
        return path.resolve(__dirname, "..", "art", project.name);
    }
    return path.resolve(__dirname, "..", "art");
}

function expandProjectSourcesForBuild(project, errors = []) {
    return expandProjectSources(
        resolveProjectRoot(project),
        project.canvas,
        project.codeblocks,
        errors,
    );
}

function SplitString64(str){

    var maxChar = 64
    str = str.replace("  ", ` `)  // remove double spaces
    str = str.replace(`"`, "'" )  // swap quotes " with single quotes '  
                        
    var sp =  str.split("\n")

    var array = []
    for(var n=0; n<sp.length; n++) {
        str = sp[n]
        const temp = str.split(' ').reduce((acc, c) => {

            // Get the number of nested arrays
            const currIndex = acc.length - 1;

            // Join up the last array and get its length
            const currLen = acc[currIndex].join(' ').length;

            // If the length of that content and the new word
            // in the iteration exceeds 20 chars push the new
            // word to a new array
            if (currLen + c.length >= maxChar) 
            {
            if (c.length>maxChar){
                
                //var regex = new RegExp(String.raw`\S.{1,${maxChar}}\S(?= |$)`, 'g');
                var chunks = c.match(/.{1,64}/g);
                for (var n=0; n<chunks.length; n++){
                    //if (acc[acc.length-1].length+chunks[n].length>maxChar)
                    if (n==0 && acc[acc.length-1].length==0)
                        acc[acc.length-1].push(chunks[n])
                    else
                        acc.push([chunks[n]])
                    // else
                    //     acc[acc.length-1].push(chunks[n])
                }
            }
            else{
                acc.push([c]);
            }

            // otherwise add it to the existing array
            } 
            else {
            acc[currIndex].push(c);
            }

            return acc;

        }, [[]]);

        // Join up all the nested arrays
        const out = temp.map(arr => arr.join(' '));
        array = [
            ...array,
            ...out
        ]
    }
    return array
}

function removeHTMLComments(str) { return str.replace(/<!--[\s\S]*?-->/g, ''); }
function removeBlockComments(str) { return str.replace(/\/\*[\s\S]*?\*\//g, ''); }
function removeLineComments(str) { return str.replace(/\/\/.*/g, ''); }

function removeAllComments(text)
{
    text = removeHTMLComments(text)
    text = removeBlockComments(text)
    text = removeLineComments(text)
    return text
}

function consolelog(str) {
    var log = document.querySelector("textarea.consoleoutput");
    log.value += '\r\n' + str;
}

function formatLineNumbers(line) {
    return line;
}

function PMasterProcessGetInserts(project) {
    return PM_GetInserts(project.canvas);
}
var FormatInt = (num, length) => 
{
    var r = "" + num;
    while (r.length < length) {
        r = "0" + r;
    }
    return r;
}
function PMasterProcess(project, existingPropertiesArray = [], uniqueProperties = true, samples = 0) 
{
    /*
    // TODO: final version can look something like this
    var values = project.values
    values.properties = getwebsiteproperties(project)
    */
    //var properties= getwebsiteproperties(project.properties)
    var values = {
        // TODO: These need to come from the (Yet to be made) editor values panel     
        
        collection: {            
            name: "test collection",
            size: 1,
            description: "The description!",
            policy: "00000000000000000000000000000000000000000000000000000000"
        },
        piece: {
            num: 1,
            seed: 0,
            tag: "PG-00-000",
        },
        artist: {
            name: "test artist"
        },

        // This value defines if it should run a sample test 
        // on the properties. This results in `output.node_graph`
        // having probablility percentages.
        debug_stat_samples: samples        
        // Higher samples = more accuracy and higher testing expence
        // 0 or null means its skipped.  output.node_graph will still 
        // have a graph output string (just without probabilities)
        ,properties:{}
    }

    if (project.data)
    {
        for (const [group_name, entries] of Object.entries(project.data)) {
            console.log(group_name)
            console.log(entries)
            if (entries.forEach)
                entries.forEach(kv=>{
                    var key = kv.key
                    var value = kv.value
                    values[group_name][key] = value
                })
        }
    }
    values.properties = {...values.properties, ...getwebsiteproperties(project.properties, project.applyrandomseed) ?? {}}
    values.piececollection = project.data.piececollection;

    var inserts = {};
    project.codeblocks.forEach(codeblock => {
       //var enabled = true
       //console.log("codeblock.enabled",codeblock.enabled)
       //if (codeblock.enabled!=undefined)
       //    enabled = codeblock.enabled
        inserts[codeblock.name] = codeblock.enabled ? codeblock.content : "disabled";
    });

    // Minify functions that the artbuilder will use
    var onMinify = (codeblock)=>{        
        return minimizeJS(Terser, codeblock)
    }
    var onMinifyGL = (codeblock)=>{
        return minimizeGLSL(GLSLX, codeblock)
    }

    return ArtBuilder(PMaster, PM_Node, onMinify, onMinifyGL, project, values, existingPropertiesArray, uniqueProperties) 
    //MJH where do we get this [] from??
    //CM: This is the website visualiser pathway so no need to supply the existingPropertiesArray 
    //    For the art generation.  Thats only needed for the server version of Art build that
    //    Prevents property clashes                                                                              
}

function isObjectIdentical(obj1, obj2) {
    // Get the keys of both objects
    const keys1 = Object.keys(obj1), 
          keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) return false  // Check if the number of keys is the same
    
    for (const key of keys1) {                       // Iterate through the keys and compare values
      if (obj1[key] !== obj2[key]) return false;
    }
    return true;   // If we haven't found any differences, the objects are identical
}

// (PMaster, PM2_Node, project, hash, values)
function Seed_To_Properties(
    PMaster,               // old property master sytem 
    PM2_Node,              // property master v2 node
    seed,                  // the seed to use (this will be increment to find a unique one)
    project,               // the project data
    fixed_properties={},   // fixed properties 
    existingProperties=[], // array of existing properties selections
    existingSeeds=[],      // array of already used seeds 
    max_attempts=100,      // defaults to 100 attempts 
    logging=false          // enable/disable the logging
){
    let errors = []
    let seed_inc = 0       // each attempt increments the seed by 1
    let final_props 
    let success = false

    // build the code through the canvas core
    let inserts = {}; // collect the inserts
    const expandedProject = expandProjectSourcesForBuild(project, errors);
    expandedProject.codeblocks.forEach(codeblock => { // reset codeblock code to its default if it is disabled
        let enabled = codeblock.enabled==undefined ? true : codeblock.enabled
        inserts[codeblock.name] = enabled ? codeblock.content : "disabled";
    });

    let PM = new PMaster(expandedProject.canvas)      // PMaster is needed because of the potential that 
                                              // not all codeblocks may be used

    PM.replaceInserts((name, defaultCode)=>{  // add the inserts into the code
        let use_default = inserts[name] == undefined || inserts[name]=="disabled"
        return use_default ? defaultCode : inserts[name]
    })

    let full_code = PM.code // the full canvas core code with inserts included 
    
    try{
        for (let n=0;n<max_attempts;n++) {                
            let node = new PM2_Node(full_code)    // create the Property v2 node

            let v2_errors = []
            if (node.IsValid(v2_errors)) {
                node.SetRandomProperties(seed+seed_inc, fixed_properties)  // set fixed properties and choose the remaining
                !node.HasValidProperties() && node.MakeValid()             // << missing properties get fixed here                
                
                final_props = node.GetProperties()

                // check for collision with existing properties 
                let has_collision = existingSeeds.includes(seed+seed_inc) 
                for(const props of existingProperties) {
                    has_collision = has_collision || isObjectIdentical(final_props, props)
                    if (has_collision) break;
                }

                // if there is a collision increment the seed and try again  
                if (has_collision) {
                    seed_inc++
                }
                else{
                    success = true
                    break;
                }
            }
            else{
                v2_errors.forEach(err=>errors.push(err))
                break;
            }
        }
    }
    catch (err){
        console.log(err)
        errors.push(err)
    }    

    if (logging) console.log(`[Hash>>Seed] ${success?"Success":"Failed"} - Seed:${seed+seed_inc} Attempt:${seed_inc} Props:${JSON.stringify(final_props).replaceAll(`"`,``)}`)    
    
    return {
        success:    success,        // was the generation successful 
        seed:       seed+seed_inc,  // final seed used
        properties: final_props,    // final properties
        seed_inc:   seed_inc,       // how many incriments to the seed
        errors:     [],             // errors in the process
    }
}



/** Build PMaster with codeblock inserts applied (no minify / art output). */
function buildPMasterFromProject(PMaster, project, errors = []) {
    const expandedProject = expandProjectSourcesForBuild(project, errors);
    var inserts = {};
    expandedProject.codeblocks.forEach((codeblock) => {
        var enabled = codeblock.enabled == undefined ? true : codeblock.enabled;
        inserts[codeblock.name] = enabled ? codeblock.content : "disabled";
    });
    var PM = new PMaster(expandedProject.canvas);
    PM.replaceInserts((name, defaultCode) => {
        var insert = inserts[name];
        if (inserts[name] == undefined) {
            return defaultCode;
        }
        if (insert == "disabled") {
            return defaultCode;
        }
        return insert;
    });
    return PM;
}

/**
 * Run property distribution sampling only (no minify, metadata, or file output).
 * See docs/PROPERTY-ANALYSIS.md.
 * @returns {Promise<object>} Analysis report with stat_data, node_graph, timing, etc.
 */
async function PropertyAnalysis(PMaster, PM2_Node, project, values, samples, onProgress) {
    const t0 = Date.now();
    const fail = (error, extra = {}) => ({
        ok: false,
        error,
        valid: false,
        stat_data: {},
        node_graph: "",
        samples: 0,
        master_seed: null,
        error_count: 0,
        errors: [],
        activeprops: null,
        allprops: null,
        duration_ms: Date.now() - t0,
        ...extra,
    });

    if (values.piece == null || values.piece.seed == null) {
        return fail("No seed supplied (values.piece.seed is required)");
    }

    const sampleCount = Math.max(1, Math.floor(Number(samples)) || 0);
    if (!sampleCount) {
        return fail("samples must be a positive integer");
    }

    try {
        var PM = buildPMasterFromProject(PMaster, project);
        let node = new PM2_Node(PM.code);
        let v2_errors = [];

        if (!node.IsValid(v2_errors)) {
            return fail("Invalid properties structure", {
                errors: v2_errors,
                structure_errors: v2_errors,
            });
        }

        node.ResetAll();
        node.SetRandomProperties(values.piece.seed, values.properties || {});
        !node.HasValidProperties() && node.MakeValid();

        const activeprops = node.GetProperties();
        const allprops = node.GetAllChoices();
        const pgMeta = node.CollectPropertyGroups();
        const propertyGroupFlags = PMasterV2.buildPropertyGroupFlags(pgMeta.propertyGroupOrder);

        let tmp_node = new PM2_Node(PM.code);
        let rnd_seed = Math.round(Date.now()) % 99999;
        tmp_node.SetRandomProperties(rnd_seed, {});
        !tmp_node.HasValidProperties() && tmp_node.MakeValid();
        tmp_node.ResetAll();

        console.log(`[PROPERTY ANALYSIS] samples:${sampleCount} master_seed:${rnd_seed}`);
        const statsResult = onProgress
            ? await tmp_node.GetStatsAsync(sampleCount, rnd_seed, {}, onProgress)
            : tmp_node.GetStats(sampleCount, rnd_seed, {});

        return {
            ok: true,
            valid: statsResult.valid,
            stat_data: statsResult.stat_data,
            node_graph: statsResult.node_graph,
            samples: statsResult.samples,
            master_seed: statsResult.master_seed,
            error_count: statsResult.error_count,
            errors: statsResult.errors,
            activeprops,
            allprops,
            propertyGroups: pgMeta.propertyGroups,
            propertyGroupOrder: pgMeta.propertyGroupOrder,
            propertyGroupFlags,
            duration_ms: Date.now() - t0,
        };
    } catch (err) {
        console.log("[PROPERTY ANALYSIS] Error:", err);
        return fail(err && err.message ? err.message : String(err));
    }
}

//function ArtBuilder(PMaster, onMinify, onMinifyGL, project, values, existingPropertiesArray, uniqueProperties = true) 
function ArtBuilder(
        PMaster,    // the old property master. Deals with directives, codeblock/value inserts
        PM2_Node,   // the new property system. This is a tree node system 
        onMinify,   // JavaScript minify funciton 
        onMinifyGL, // GLSLX minifier
        project,    // the project data
        values,     // the value insert data
        existingPropertiesArray, // an array of all existing properties
        uniqueProperties = true  // should the randomiser try and keep properties unique?
    )
{
    console.log(`[ARTBUILDER] Starting...`)
    /* REQUIRED VALUES:        
            values.properties          
            values.collection.name
            values.collection.size
            values.collection.description
            values.collection.policy
            values.piece.num
            values.piece.seed
            values.artist.name
    */
    var errors = []                 // All errors are accumulated here
    var num = values.piece.num      

    try{
        values.piece.num_pad2 = FormatInt(num, 2) // these padded values are used by 
        values.piece.num_pad3 = FormatInt(num, 3) // directive inserts and end up in
        values.piece.num_pad4 = FormatInt(num, 4) // the piece tag and piece name
            
        console.log(`[ARTBUILDER] building piece:${num} seed:${values.piece.seed}`)    

        //** HASH PROCESSING ** This has moved to the BuildArt process Where the seed
        //                      should already be decided prior to the art builder.
        //                      If a hash is used `values.piece.hash` should be set.

        var inserts = {};
        const expandedProject = expandProjectSourcesForBuild(project, errors);
        expandedProject.codeblocks.forEach(codeblock => {
            // reset codeblock code to its default if it is disabled
            var enabled = codeblock.enabled==undefined ? true : codeblock.enabled
            inserts[codeblock.name] = enabled ? codeblock.content : "disabled";
        });
        
        // create a new property master with the canvas core code
        var PM = new PMaster(expandedProject.canvas)
    
        // run through all codeblocks and insert them into the canvas core
        console.log(`[ARTBUILDER] Starting processing inserts`)    
        PM.replaceInserts((name, defaultCode)=>{
            var insert = inserts[name]     
            if (inserts[name] == undefined){
                console.log(`[ARTBUILDER] insert '${name}' is missing. Using default (#chars:${defaultCode.length})`)    
                return defaultCode
            }
            else if (insert=="disabled") {
                console.log(`[ARTBUILDER] insert '${name}' is disabled. Using default (#chars:${defaultCode.length})`)    
                return defaultCode
            }
            else{
                console.log(`[ARTBUILDER] adding insert '${name}' (#chars:${insert.length})`)    
                return insert
            }
        })

        // a seed MUST be present
        if (values.piece.seed == null) {            
            let err = "No seed supplied!  values.piece.seed is NULL"
            errors.push({ info: err, error: err })
        }

        var template = PM.generateTemplate()        // generate the v1 PMaster template (these get overriden later by the V2 node)
        var property_template = PM.getProperties()  


        //  ----------------------------------------------------------------------------------
        // ***                        PMaster V2 GRAPH PROPERTIES                           *** 

        let node = new PM2_Node(PM.code)  // << take the code out of old PM and create a V2 node
                                         //    This parses into a node graph ready for building
        let property_choices = {}
        let v2_errors = []
        let rnd_properties
        let node_graph
        
        try{
            console.log(`[ARTBUILDER] Processing V2 properties`)    

            // This validates that the v2 property code is all cool. Things like all 
            // properties must have end brackets with valid syntax
            if (node.IsValid(v2_errors)) {    

                console.log(`[ARTBUILDER] Incoming fixed properties: `+JSON.stringify(values.properties).replaceAll(`"`,``))                
                console.log(`[ARTBUILDER] Generating remaining properties SEED:`+values.piece.seed)

                node.ResetAll()
                //console.log("debug starting:")
                //console.log(node.GetPropertyNames())

                // set the properties and auto choose any missing ones
                node.SetRandomProperties(values.piece.seed, values.properties)

                console.log(`[ARTBUILDER] Has valid properties:`+node.HasValidProperties())

                // if properties are still incomplete, fix them 
                !node.HasValidProperties() && node.MakeValid() // << any missing properties 
                                                               //    get populated here

                //console.log(`[ARTBUILDER] Extract properties`)
                // extract final properties
                values.properties = node.GetProperties()
    
                console.log(`[ARTBUILDER] Final properties:`+JSON.stringify(values.properties).replaceAll(`"`,``))    
                    
                template.properties.active = node.GetProperties()  
                template.properties.visible = node.GetProperties() 
                
                //console.log(`[ARTBUILDER] Extract choices`)
                template.properties.all = node.GetAllChoices() // extract all possible choices that are valid for this combo.
                                                               // This does not include properties that exist in deactivated 
                                                               // property node branches of the code. 
                template.properties.options = null
                                
                // Create a new node for random property roll (for the dice icon in the editor)
                //console.log(`[ARTBUILDER] Random roll `)
                let tmp_node = new PM2_Node(PM.code)             // create a new temp node
                let rnd_seed = Math.round(Date.now()) % 99999   // create a time based seed
                //console.log(`[ARTBUILDER] Random roll. Set random props`)
                tmp_node.SetRandomProperties(rnd_seed, {})      // select random properties
                //console.log(`[ARTBUILDER] Random roll. Valid:`+tmp_node.HasValidProperties())
                !tmp_node.HasValidProperties() && tmp_node.MakeValid() // guarantee that those are complete
                rnd_properties = tmp_node.GetProperties()       // << get the random properties 

                tmp_node.ResetAll()                             // reset the nodes ready for the node graph creation 
                                
                if (values.debug_stat_samples!=null) {          // pobability distribution node graph 
                    
                    // This is expensive and increases in expence with high numbers of samples. This generates entire 
                    // property combinations that are then measured and normalised to give estimated % probability hits 
                    // for each property choice. The higher the samples the more accurate this is

                    console.log(`[ARTBUILDER] Generating probability node graph.  Build samples:`,values.debug_stat_samples)    
                    const statsResult = tmp_node.GetStats(values.debug_stat_samples, rnd_seed);
                    node_graph = statsResult.node_graph;
                }
                else{
                    console.log(`[ARTBUILDER] Generating basic node graph`)    
                    node_graph = tmp_node.NodeGraph(false)
                }
    
                // put the resulting code back into the old property master
                PM.code = node.Build(true)  // Built code is stripped of inactive property code
                                            // So from this point onwards the properties are 
                                            // fully set and can't change
            }
            else{
                console.log("Error with Properties V2")
                console.log(v2_errors)
                errors.push({
                    info:"[Properties V2] Invalid properties structure:",
                    error: v2_errors.join("\n")
                })
            }
        }
        catch (err){
            console.log("[ARTBUILDER] Unknown error in Property Master V2")
            console.log(err)
            errors.push({ info:"Unknown error in Property Master V2:", error: err })
        }
        // ----------------------------------------------------------------------------------


        var canvas_core_update = node.Export()  // This exports all code from PM2.  (Including all property possibilities)
                                                // this is the updated canvas core that contains the inserts that come in 
                                                // from the UI
            
        console.log("[ARTBUILDER] Assembling value data for expressions")
        var token_data = values.token_data ?? {collection:{},piece:{},artist:{}}
        var collection_override = token_data.collection ?? {}
        var piece_override = token_data.piece ?? {}
        var artist_override = token_data.artist ?? {}
        
        var data = {
            properties: values.properties,       // the final full properties 
            collection: { // default values that appear if no overrides come in
                name: "collection name not present",
                size: 1,
                description: "description not present",
                artist: "moved to 'artist.name'", // TODO: Remove from demo canvas core
                policy: "policy id not present",
                    
                ...values.collection,      // collection values from this functions arguments                
                //...values.piececollection  // collection overrides from the piece 
                ...collection_override  // overrides coming from collection data
            },
            piece: { // defaults                
                num:1,
                seed:0,        
                tag: "PG-00-000",    
                    
                ...values.piece,        // piece values from this functions arguments
                ...piece_override       // overrides coming from collection data
            },
            artist: { // defaults
                name: "artist name not present",
                    
                ...values.artist,       // piece values from this functions arguments
                ...artist_override      // overrides coming from collection data
            },
            do_screenshot: false
        }

        
        var properties = data.properties    // used in the eval statements for PMaster
        var collection = data.collection    // used in the eval statements for PMaster
        var piece = data.piece              // used in the eval statements for PMaster
        var artist = data.artist            // used in the eval statements for PMaster

        var SplitInsertString64 = (str,char="|",description=[],count=64)=>{
            //var description = []
            const maxLength = count-1; // set the maximum line length here
            const regex = new RegExp(`.{1,${maxLength}}(\\s|$)|\\S+?(\\s|$)|\\n+`, "g");
            const descriptionArray = []
            const matches = str.match(regex) ?? []
            matches.forEach(txt=> { description.push(txt.trim()) });
            //collection.description = description.join(`|`)
            return description.join(`|`)
        }
        /*
        var description = []
        const maxLength = 63; // set the maximum line length here
        const regex = new RegExp(`.{1,${maxLength}}(\\s|$)|\\S+?(\\s|$)|\\n+`, "g");
        const descriptionArray = []
        const matches = collection.description.match(regex) ?? []
        matches.forEach(txt=> { description.push(txt.trim()) });
        */
        var description = []
        collection.description = SplitInsertString64(collection.description,"|", description) //description.join(`|`)

        // split the description data
        var visible_properties = PM.removeHiddenProperties(properties)           // strip any hidden properties 

        let prop_names = Object.values(visible_properties).join(', ')
        data.piece.property_names = SplitInsertString64(prop_names,"|") // join the property values for the canvas back
        data.has_properties = Object.keys(visible_properties).length > 0         // are there none hidden properties

        var artName =
            values.piececollection?.name ??
            data.collection.name + " " + data.piece.num_pad3;
        var flatForInserts = { ...(project.metadataFlat || {}) };
        if (
            flatForInserts.description != null &&
            flatForInserts.description !== ""
        ) {
            flatForInserts.description = SplitInsertString64(
                flatForInserts.description,
                "|",
                [],
                64,
            );
        }
        values = {
            ...values,
            name: artName,
            description: collection.description,
            artist: data.artist.name,
            tag: data.piece.tag,
            num: data.piece.num,
            seed: data.piece.seed,
            num_pad2: data.piece.num_pad2,
            num_pad3: data.piece.num_pad3,
            num_pad4: data.piece.num_pad4,
            has_properties: data.has_properties,
            property_names: data.piece.property_names,
            ...flatForInserts,
        };
        piece = data.piece;

        // run through all directives.  Executing the expression within the brackets on each
        var ProcessDirectives = (pm)=>{
            pm.processDirectives((expr)=>{        
                try{ // eval: POTENTIAL VUNERABILITY
                    return eval(expr)    // the return value here will enable/disable the block comment for that directive 
                }
                catch (err) {
                    console.log("[ARTBUILDER] DIRECTIVE ERROR:", expr, err)
                    errors.push({ info:"Directive error in expresssion: "+expr, error: err })
                    return false
                }
            })
        }
        
        console.log("[ARTBUILDER] Processing directive expressions...")
        ProcessDirectives(PM)
        
        console.log("[ARTBUILDER] Doing value insert expressions...")
        PM.processValueInserts((expr)=>{
            try{ // eval: POTENTIAL VUNERABILITY
                return eval(expr)  // the return value replaces the markup in the code
            }
            catch (err) {
                console.log("[ARTBUILDER] VALUE INSERT ERROR:", expr)
                console.log(err)
                errors.push({
                    info:"VALUE INSERT ERROR expresssion: "+expr,
                    error: err
                })
                return expr
            }
        })

        console.log("[ARTBUILDER] Build art code...")
        var output = PM.getResult();
        var output_min = ""
        var output_screenshot = ""
        console.log("[ARTBUILDER] Generated art code #chars:",output.length)
    
        try{
            //-----------------------------------------------------------------------------------------
            // GENERATE THE FINAL ART SCREENSHOT CODE
            data.do_screenshot = true;
        
            // update the directives again but with the data.screenshot active
            console.log("[ARTBUILDER] Processing directives again... (for the screenshot art code)")
            ProcessDirectives(PM)
            
            // Minify the GL and JS codeblocks
            PM.minify('minifyGL', (codeBlock)=>{ return onMinifyGL(codeBlock); })    
            PM.minify('minify', (codeBlock)=>{ return onMinify(codeBlock); })
            PM.removeBlankLines()

            console.log("[ARTBUILDER] Minifying...")
            output_screenshot = PM.getResult() // the resulting minified screenshot art code
    
            console.log("[ARTBUILDER] Screenshot Minify COMPLETE!  #chars:", output_screenshot.length)            
            //-----------------------------------------------------------------------------------------
    
            
            //-----------------------------------------------------------------------------------------
            // GENERATE THE FINAL ART CODE
            PM.code = output // set the code in the PMaster back to the art code            
            
            // Minify the GL and JS codeblocks
            PM.minify('minifyGL', (codeBlock)=>{ return onMinifyGL(codeBlock); })    
            PM.minify('minify', (codeBlock)=>{ return onMinify(codeBlock); })
            PM.removeBlankLines()            
            
            output_min = PM.getResult()                 // the resulting minified final art code        
            output_min = removeHTMLComments(output_min) // ccv3 needed html comments that do not get
                                                        // removed by any other process

            // % escape has been moved a few lines down so that it only applies to 
            // the utf8link version as it would otherwise break the minimised html 

            console.log("[ARTBUILDER] Art Minify COMPLETE! #chars:", output_min.length)            
            //-----------------------------------------------------------------------------------------
        }
        catch (err) {
            console.log("[ARTBUILDER] Minify error:\n", err) 
            errors.push({ info:"Minify process failed", error: err })
        }            
        
        // see construct2/docs/UTF8LINK-METADATA.md for rationale and rules
        var utf8link_min = output_min.replace(/[% #]/g, m => '%'+m.charCodeAt(0).toString(16))
        var utf8link = "data:text/html;utf8,"+utf8link_min

        var char_errors = CheckForInvalidChars(utf8link)
        if (char_errors.length>0) {
            char_errors.forEach(e=>{
                console.log("illegal character detected: "+e)
                errors.push({ info: "illegal character detected: "+e, error: e })
            })
        }

        //code to apply the name from the piececollection overide if it exists, and not add a counter to it
        var name = values.piececollection?.name??(data.collection.name+" "+data.piece.num_pad3)
        var token_name = name.replaceAll(' ','')

        // force the token name if its being overriden
        if (piece_override.token_id && piece_override.token_id!="") {
            token_name = piece_override.token_id.replaceAll(' ','')
            console.log("[ARTBUILDER] Using Override token name: "+token_name)            
        }
        else{
            console.log("[ARTBUILDER] Using default token name: "+token_name)
        }

        if (!utf8link || utf8link.length < 20) {
            errors.push({
                info: "utf8link missing or too short for metadata",
                error: "utf8link length " + (utf8link ? utf8link.length : 0),
            });
        }
        var metadataFlat = project.metadataFlat || {};
        var metadataValues = {
            policy: data.collection.policy,
            collection_name: data.collection.name,
            name: name,
            token_name: token_name,
            artist: data.artist.name,
            num: String(data.piece.num),
            seed: String(data.piece.seed),
            tag: data.piece.tag,
            piece: String(data.piece.num),
            ...metadataFlat,
        };
        if (
            metadataFlat.name &&
            (!piece_override.token_id || piece_override.token_id === "")
        ) {
            metadataValues.token_name = String(metadataFlat.name).replaceAll(
                " ",
                "",
            );
        }
        if (!metadataValues.hash && values.piece.hash) {
            metadataValues.hash = values.piece.hash;
        }
        if (data.collection.auth) metadataValues.authNFT = data.collection.auth;
        var metadataProperties = data.has_properties ? visible_properties : {};

        var metadata = null;
        var metadata_min = "";
        var metadata_size = 0;
        var metadata_inner = null;
        var pool_pm_link = "";
        var metadata_builder_missing = false;

        var metadata_outputs = null;

        if (typeof project.createMetadata === "function") {
            try {
                console.log("[ARTBUILDER] Building metadata via project metadata.js");
                const rawResult = project.createMetadata(
                    metadataValues,
                    metadataProperties,
                    utf8link,
                );
                const {
                    normalizeCreateMetadataResult,
                    processMetadataOutputs,
                    extractMetadataInner,
                    PRIMARY_METADATA_FILE,
                } = require("./metadata_loader.js");
                const normalized = normalizeCreateMetadataResult(rawResult);
                if (!normalized.ok) {
                    errors.push({
                        info: "CreateMetadata must return an object",
                        error: normalized.error,
                    });
                } else {
                    metadata_outputs = processMetadataOutputs(
                        normalized.files,
                        utf8link,
                        project.cardanoMetadataSplit,
                    );
                    const primaryKey =
                        metadata_outputs[PRIMARY_METADATA_FILE]
                            ? PRIMARY_METADATA_FILE
                            : Object.keys(metadata_outputs)[0];
                    const primary = metadata_outputs[primaryKey];
                    metadata = primary.object;
                    metadata_min = primary.min;
                    metadata_size = primary.size;
                    pool_pm_link =
                        "https://pool.pm/test/metadata?metadata=" +
                        encodeURIComponent(metadata_min)?.replaceAll("%", "%25");
                    try {
                        metadata_inner = extractMetadataInner(metadata);
                    } catch (_) {
                        metadata_inner = null;
                    }
                }
            } catch (err) {
                console.log("[ARTBUILDER] CreateMetadata error:", err);
                errors.push({ info: "CreateMetadata failed", error: err });
            }
        } else {
            console.log("[ARTBUILDER] No metadata.js — skipping metadata output");
            metadata_builder_missing = true;
        }

        const pgMeta = node.CollectPropertyGroups();
        const propertyGroupFlags = PMasterV2.buildPropertyGroupFlags(pgMeta.propertyGroupOrder);

        console.log(`[ARTBUILDER] Completed! #errors: ${errors.length}`)
        return {
            token_name: token_name,
            errors: errors,
            output: output,
            output_min: output_min,
            output_screenshot: output_screenshot,
            utf8link: utf8link,
            canvas_core_update: canvas_core_update,
            metadata: JSON.stringify(metadata, null, 2),
            metadata_min: metadata_min,
            metadata_size: metadata_size,
            properties_template: template.properties,
            activeprops:  node.GetProperties(), 
            allprops: node.GetAllChoices(),
            propertyGroups: pgMeta.propertyGroups,
            propertyGroupOrder: pgMeta.propertyGroupOrder,
            propertyGroupFlags,
            salesselections: node.GetSalesSelections(),      
            random_properties: rnd_properties,
            linenumbers: PM.insertLineNumbers,
            metadata_inner: metadata_inner,
            metadata_outputs: metadata_outputs,
            metadata_builder_missing: metadata_builder_missing,
            pool_pm_link: pool_pm_link,
            template: template,
            node_graph: node_graph,
        };
    }
    catch (err) {
        console.log("[ARTBUILDER] Error caught:", err);
        errors.push({ info:"Unknown Art builder error", error: err });
        return { errors: errors };
    }
}

//taken from https://stackoverflow.com/questions/5515869/string-length-in-bytes-in-javascript
function byteLength(str) {
    // returns the byte length of an utf8 string
    var s = str.length;
    for (var i=str.length-1; i>=0; i--) {
      var code = str.charCodeAt(i);
      if (code > 0x7f && code <= 0x7ff) s++;
      else if (code > 0x7ff && code <= 0xffff) s+=2;
      if (code >= 0xDC00 && code <= 0xDFFF) i--; //trail surrogate
    }
    return s;
}

function CheckForInvalidChars(str)
{
    //var code = ""
    var invalidChars = '#'   // only # needs pre-check (we escape it for data: URI)
    var errors = []
    for(var n=0;n<str.length;n++) {
        var c = str.charCodeAt(n)
        var char = str[n]
        if (c>=128) {
            console.log("Error detected (none utf8 character)")
            errors.push("Bad Char found: "+char+` has code: ${c}`)
        }
        else if (invalidChars.includes(char)) {
            console.log("Error detected (illegal char)")
            errors.push("Bad Char found: '"+char+"'  This is on the illegal chars list")
        }
    }
    return errors
}

//MH - this function is horrible, basically creates a js object based on the currentvalue of each prop
function getwebsiteproperties(props, applyrandomseed)
{
    var obj = null;

    if (props != null)
    {
        var strjson = '{';
        Object.keys(props).forEach(key => {
            // if we're not applying a random seed from the website then the user has chosen the prop values directly, 
            // so we set them all to match the UI, else we only set the locked props
            if (props[key].locked || !applyrandomseed)
            {
                strjson += '"' + key + '" : "' + props[key].currentvalue + '",';            
            }
        });
        if (strjson.length > 1)
        {
            strjson = strjson.slice(0, -1);
        }
        strjson += '}';
        obj = JSON.parse(strjson);
    }
    return obj;
}

function minimizeJS(Terser, js)
{
    if (!Terser)
        console.log("ERROR The Terser lib is missing")
    var result = Terser.minify(js, {
        toplevel: true,
        //these options work for shader wars, may need to disable them for other collections?
        //https://terser.org/docs/api-reference#compress-options
        compress: {
          passes: 7,				
          pure_getters: true,
          arguments: true,
          unsafe: true,
          drop_console: true,
          drop_debugger: true,
          ecma: 2015,
          unsafe_arrows: true,          
          unsafe_Function: true,
          unsafe_math: true,
          unsafe_methods: true,
          unsafe_proto: true,
          unsafe_regexp: true,
          unsafe_undefined: true,

        //   keep_fargs: false,
        //   pure_funcs: true,

        //   evaluate: false,


        //   reduce_vars: false, // experimental
        //   hoist_props: false,
        },
        format: {
            ascii_only: false,
            ecma: 5,
            quote_style: 1
        }
      });
    return result.code
}

function minimizeGLSL(GLSLX, glsl)
{
    let compilationresult = GLSLX.compile(glsl, { renaming: "internal-only"});
    if (compilationresult.log != "")
    {
        throw compilationresult.log;
    }
    else
    {
        glsl = JSON.parse(compilationresult.output).shaders[0].contents;
    }
    //MJH custom optimisation code for shader wars, saves around 300 bytes    
    glsl = glsl.replaceAll("float","@").replaceAll("vec","~");
    glsl += "`;fs=fs.replace(/@/g,'float').replace(/~/g,'vec')";
    glsl += ";let x=`";
    
    return glsl    
}


try {
    module.exports ={
        ArtBuilder: ArtBuilder,
        PropertyAnalysis: PropertyAnalysis,
        Seed_To_Properties: Seed_To_Properties,
        minimizeGLSL: minimizeGLSL,
        minimizeJS: minimizeJS
    } 
}
catch (error) {
	//website doesn't understand exports, just swallow the error
}
