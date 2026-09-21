/** Per-group UI/build flags keyed by group label from `//#<<Group>…>`. */
const PROPERTY_GROUP_FLAGS = {
    "Debug": { pinOnRandom: true, lockUi: true },
    "Hex DNA": { contributesToHxDna: true },
};

function buildPropertyGroupFlags(groupOrder) {
    const flags = {};
    for (const g of groupOrder || []) {
        if (PROPERTY_GROUP_FLAGS[g]) flags[g] = { ...PROPERTY_GROUP_FLAGS[g] };
    }
    return flags;
}

let ParseLine = (line, lineNum=0)=>{
    /*  This parses a single line and returns an object with
        details about what that line contains. An example return 
        object is listed below.  This output object is used by 
        the Node class to create a tree of properties.
    
    USAGE:
        let result = ParseLine(` //# <something:custom1> {"prob":1}`)
        
        Returns => 
        {
            original: '    //# <something:custom1> {"prob":1} ',
            trim:     '//# <something:custom1> {"prob":1}',

            type: "property",       // the type of this node

            errors: [],             // any errors get written into this array
            isToken: true,          // is this a token? ie: does it contain //#
            isCode: false,          // is the entry just code / text
            isProperty: true,       // the line has a property 
            isDirective: false,     // the line is a directive
            isInsert: false,        // the line is an insert block
            isEnd: false,           // the line is an end marker 
            
            // property related result
            property: 'something:custom1',
            property_json: '{"prob":1}',
            property_options: { prob: 1 },
            property_name: 'something',
            property_value: 'custom1'
            
            // directive related result
            directive: 'directive'

            // insert related result
            insert_type: 'codeblock',
            insert_value: 'draw2'
        }    
    */
    //let isProperty_v1 = /^\s*\/\/\*#|^\s*\/\*#\s*<[^>]+>/.test(line.trim())
    let isProperty_v1   = /^\s*\/?\/\*#.*<[^>]+>/.test(line.trim())
        //^\s*\/\/\*#<[^>]+>
    let isToken = line.trim().startsWith("//#") || isProperty_v1
    let isProperty = isToken && /<[^>]+>/.test(line.trim())
    let result = {
        original: line,
        trim: line.trim(),
        lineNum: lineNum,
        type: "text",
        errors: [],
        isToken: isToken,
        isCode: !isToken,
        isProperty: isProperty || isProperty_v1,
        isProperty_v1: isProperty_v1,
        isDirective: isToken && /\[.*\]/.test(line.trim()),
        isInsert: isToken && !isProperty && /\{.*\}/.test(line.trim()),
        isEnd: isToken && line.trim() === "//#",
        isEnd_v1: line.trim().startsWith("//#*/")
    }
    if (result.isEnd_v1) {
        result.isEnd = true
    }
    if (result.isEnd) {
        result.type = "end"
    }
    if (result.isDirective) {        
        let match = line.trim().match( /\/\/#.*\[([^\]]+)\]/ )        
        if (match) {
            result.directive = match[1]
            result.type = "directive"
        }
        else{
            result.errors.push("Invalid directive syntax")
            result.errors.push("Correct format: `//#[ directive ]")
        }
    }
    if (result.isProperty) {
        const trim = line.trim()
        let json_match = trim.match(/{([^>]+)}/)
        result.property_options = {}
        result.property_json = "{}"
        if (json_match) {
            try{
                let json = json_match[0].replaceAll("'",'"')
                result.property_json = json
                result.property_options = JSON.parse(json)
            }
            catch (error) {
                result.errors.push("Error parsing property json options")
                result.errors.push(error)
            }
        }
        result.type = "property"
        result.property_v1 = isProperty_v1
        let grouped =
            trim.match(/^\/\/#<<([^>]+)>([^:]+):([^>]+)>\s*(\{.*\})?\s*$/) ||
            trim.match(/^\/?\/\*#<<([^>]+)>([^:]+):([^>]+)>\s*(\{.*\})?\s*$/)
        if (grouped) {
            result.property_group = grouped[1]
            result.property_name = grouped[2]
            result.property_value = grouped[3]
            result.property = result.property_name + ":" + result.property_value
        } else {
            result.property_group = null
            result.property = trim.match(/<([^>]+)>/)[1]
            let split = result.property.split(":")
            let value = split.pop()
            result.property_name = split.join(":")
            result.property_value = value
        }
    }
    if (result.isInsert) {
        const match = line.match( /\/\/\s*#?\s*(\w+)\s*\{(\w+)\}/ )
        if (match) {            
            result.type = "insert"
            result.insert_type = match[1]
            result.insert_value = match[2]    
        }
        else{
            result.errors.push("Invalid directive syntax")
            result.errors.push("Correct format: `//#[ directive ]")
        }
    }
    if (isToken) {
        if (!(result.isProperty || result.isDirective || result.isInsert || result.isEnd)) {
            result.errors.push("Invalid token. Line has `//#` token but isn't a directive, insert, property or end marker.")
            result.errors.push("If this is meant to be an end marker then it needs to be just `//#` alone on its line")
        }
    }
    result.isValid = result.errors.length == 0
    //if (result.isEnd_v1)
      //  console.log(result)
    return result
}

class PM_Node 
{
    // Create a new Node by adding code as an argument.
    // The node then parses each seperate line and will    
    // create a node tree for all of the content based     
    // on the directives present

    constructor(code)
    {
        this.isNode = true      
        this.enabled = true         // is this node enabled/disabled
        this.info = null            // first line info
        this.content = []           // parsed line content + sub nodes
        code && this._Parse(code)   // parse the code (if its there)
    } 

    forEach(fn) // Iterate all nodes.  Deligate: (node)=>{ }
    {
        fn(this)
        this.content.forEach(item=>item.isNode && item.forEach(fn))
    }

    Enable(enabled, recursive=false) // enable/disable node (optional do children too)
    {   
        this.enabled = enabled
        recursive && this.content.forEach(item=>item.isNode && item.Enable(enabled))
    }

    ResetAll()
    {
        this.forEach(node=>node.Enable(true))
    }

    _Parse(code)
    { 
        let lines = code.trim().split(/\r?\n/)
        let parsed = []
        let lineNum = 1
        lines.forEach(line=>{
            parsed.push( ParseLine(line, lineNum) ) 
            lineNum++
        })
        this._AddLines( parsed )
    }

    _AddLines(parsed_lines, depth=0) 
    {
        if (parsed_lines.length==0) throw "error: lines array is empty"

        this.content = []     // reset the existing content
        this.depth = depth    // the node depth of this (used for sorting)
        
        let remaining = [ ...parsed_lines ]  // duplicate the array
        do{
            let info = remaining.shift()
            if (this.content.length==0) {                
                this.info = info        // first line gets set as the node.info
                this.content.push(info)
            }
            else{         
                if (info.isToken && !info.isEnd) {
                    // this is a new directive. Create a sub node 
                    remaining.unshift(info)
                    let sub_node = new PM_Node()
                    remaining = sub_node._AddLines(remaining, depth+1)
                    this.content.push(sub_node)
                }
                else if (this.info.isToken && info.isEnd) {
                    this.content.push(info)                     
                    break;  // break because the end token is for this node
                }
                else{                    
                    this.content.push(info)  // its a code line 
                }
            }
        }
        while(remaining.length>0)
        
        return remaining    // any remaining lines are returned to the parent node 
    }   

    Export()   // extracts all code + directives
    {
        let str = ""
        this.content.forEach(item=>{
            str += item.isNode ? item.Export() : item.original + "\n"
        })
        return str
    }

    Build(includeTokens)    // builds final code (does not include inactive nodes)
    {
        let str = ""
        //let n = 0
        this.content.forEach(item=>{
            if (item.isNode) {
                if (item.enabled) {
                    str += item.Build(includeTokens) 
                } 
            }else{
                if (item.isToken) {
                    if (includeTokens) {
                        if (item.isProperty) {
                            if (item.property_group) {
                                str += "//#<<"+item.property_group+">"+item.property_name+":"+item.property_value+">\n"
                            } else {
                                str += "//#<"+item.property_name+":"+item.property_value+">\n"
                            }
                        }
                        else if (item.isEnd){
                            str += "//#\n"
                        }
                    }
                }
                else{
                    str += item.original+"\n"
                }
            }
            //n++
        })
        return str
    } 

    MakeValid(root=true)
    {
        // JOB: to guarantee that the structure is valid
        //      even if the current property config is
        //      incomplete

        this.content.forEach(item=>{
            if (item.isNode){
                if (item.enabled) {
                    item.MakeValid(false)
                } 
                else{
                    item.Enable(false,true)
                }
            }
        })

        if (root) {
            let properties = this.GetProperties()
            //console.log("get properties:", properties)
            let missing = []
            this.GetPropertyNames().forEach(name=>{
              if (!properties[name] || Array.isArray( properties[name] )) {
                missing.push(name)
                let choices = this.GetPropertyChoices(name)
                //console.log("Setting missing property:", name, ":", choices[0])
                this.SetProperty(name, choices[0])
              }
            })
            properties = this.GetProperties()
            //console.log("Setting missing properties:", missing)
            //console.log("Final properties:", properties)
        }
    }

    SetProperty(name, value) // set a single property 
    {
        this.forEach(node=>{
            if (node.info.isProperty) {
                if (node.info.property_name == name) {
                    node.Enable(node.info.property_value == value)
                }
            }
        })
    }   

    SetProperties(properties) // set multiple properties 
    {
        for (const [key, value] of Object.entries(properties)) {
            this.SetProperty(key,value)
        }
    }

    GetPropertyChoices(name, choices=[])
    {
        this.content.forEach(item=>{
            if (item.isNode){
                let info = item.info
                if (info.isProperty && info.property_name == name) {
                    let value = info.property_value
                    !choices.includes(value) && choices.push(value)
                }
                item.enabled && item.GetPropertyChoices(name, choices) // go deeper into enabled nodes!
                
            } 
        })
        return choices 
    }

    GetPropertySalesSelections(name, salesselections=[])
    {
        this.content.forEach(item=>{
            if (item.isNode){
                let info = item.info
                if (info.isProperty && info.property_name == name) {                                        
                    info.property_options['salesselection'] && !salesselections.includes(name) && salesselections.push(name)                    
                }
                item.enabled && item.GetPropertySalesSelections(name, salesselections) // go deeper into enabled nodes!
                
            } 
        })
        return salesselections 
    }

    GetPropertyNames(names=[], root=true)
    {
        // collect all names of properties in the active hierarchy.
        // Depth sort so that most significant properties are first

        this.content.forEach(item=>{
            if (item.isNode){
                let info = item.info
                if (info.isProperty) {                    
                    if (!names.includes(info.property_name)) {
                        names.push(info.property_name)
                    }
                }
                item.enabled && item.GetPropertyNames(names, false)
            }
        })

        if (root) {
            // sort based on depth 
            let depth_names = []
            names.forEach(name=>{
                let count = 0
                let acc = 0
                let values = []
                this.forEach(node=>{
                    if (node.info.isProperty 
                        && node.info.property_name==name
                        && !values.includes(node.info.property_value)) {
                        values.push(node.info.property_value)
                        count++
                        acc += node.depth
                    }
                })
                acc = acc / count
                depth_names.push([acc, name])
            })
            depth_names.sort((a,b)=>a[0] - b[0])
            names = []
            depth_names.forEach(item=>names.push(item[1]))
            //console.log(depth_names)
            return names
        }
    }

    HasNodes()  // returns true if node has child nodes
    {
        let hasNodes = false
        this.content.forEach(item=> hasNodes = hasNodes || item.isNode )
        return hasNodes 
    }

    GetPropertyOptions(name,value)
    {
        let options = { prob:1 } // < default options
        
        // go through all nodes and get options
        this.forEach(node=>{
            if (node.info.isProperty) {
                if (name == node.info.property_name) {
                    if (value == node.info.property_value) {
                        options = {
                            ...options,
                            ...node.info.property_options
                        }
                    }
                }
            }
        })
        return options
    }
    
    // sets weighted random properties based on a seed 
    SetRandomProperties(seed, fixedProperties={})
    {
        // prime the RNG 
        let RN = new PM_RNG(seed)
                
        // reset all nodes
        this.ResetAll()

        // run through the properties (in depth order)
        this.GetPropertyNames().forEach(name=>{

            // burn 2 rng digits prior to each cycle
            RN.r();RN.r()

            if (fixedProperties[name]) {

                // use the fixed property if it exists
                let value = fixedProperties[name]
                this.SetProperty(name, value)
            }
            else{
                // collect choices, weight them then select one
                let choices = this.GetPropertyChoices(name)
                
                if (choices.length>0) {
                    let weightedChoices = []
                    choices.forEach(value=>{
                        let options = this.GetPropertyOptions(name, value)
                        weightedChoices.push([options.prob, value])
                    })
                    //if (name=="type"){
                    //    console.log(choices)
                    //}
                    let selected = WeightedRandom(RN, weightedChoices)
                    this.SetProperty(name, selected[1])
                }
                else{
                    //console.log(`Property '${name}' has no valid choices`)
                }
            }            
        })
        if (!this.HasValidProperties()) {
            let properties = this.GetProperties()
            this.GetPropertyNames().forEach(name=>{
                if(Array.isArray(properties[name])) {
                    properties[name] = null
                }
            })
            this.SetRandomProperties(seed+1, properties)
        }

    }

    GetProperties(properties={}, root=true)
    {
        // this gets properties that are active
        // if more than one of the same type are 
        // active has an array of the active props

        this.content.forEach(item=>{
            let node = item.isNode ? item : null

            if (node && node.enabled) {
                if (node.info.isProperty) {
                    let name = node.info.property_name
                    let value = node.info.property_value
                    if (properties[name]) {
                        if (properties[name] != value) {
                            if (!Array.isArray(properties[name])) {
                                properties[name] = [ properties[name] ]
                            }
                            if (!properties[name].includes(value)){
                                properties[name].push(value)
                            }
                        }
                    }
                    else{
                        properties[name] = value
                    }
                }
                node.GetProperties(properties, false)
            }
        })

        if (root) {
            // get all property names for the current 
            // level of node activation. Then get all 
            // choices for each if that property is not
            // selected
            
            this.GetPropertyNames().forEach(name=>{                
                if (!properties[name] || Array.isArray(properties[name])) { 
                    properties[name] = this.GetPropertyChoices(name) 
                }
            })
        }
        return properties
    }

    HasValidProperties()
    {
        let properties = this.GetProperties()
        let valid = true;
        this.GetPropertyNames().forEach(name=>{
            if (!properties[name] || Array.isArray(properties[name]) ) {
                valid = false
            }
        })
        return valid
    }

    IsValid(errors=[])
    {
        // check if this node structure is valid
        // itterate through all sub nodes and do the same
        // collects the errors and gives a bool result for valid
        
        if (this.content.length>0) {
            if (this.info.isToken) {
                if (!this.content[this.content.length-1].isEnd) {
                    errors.push(`Error ${this.info.lineNum}:'${this.info.trim}' has no matching end token`)
                }
            }
            this.content.forEach(item=>{
                if (item.isNode) {
                    if (item.info.errors.length!=0) {
                        item.info.errors.forEach(error=>{
                            errors.push(`Parser error: ${this.info.lineNum}: ${error}`)
                        })
                    }
                    // check if this is a property
                    if (item.info.isProperty){
                        item.forEach(node=>{
                            // check if a same-name property with a different value exists deeper in the graph
                            // (if so, then its unreachable and invalid)
                            if (node.info.isProperty) {
                                if (node.info.property_name==item.info.property_name) {
                                    if (node.info.property_value!=item.info.property_value) {
                                        let error = `Parser error: [Invalid property]\n  ${node.info.lineNum}:${node.info.trim}\n  < Can not be within >\n  ${item.info.lineNum}:${item.info.trim}`
                                        errors.push(error)
                                    }
                                }

                            }
                        })
                    }

                    item.IsValid(errors)
                }
                else if (item.errors.length!=0){
                    // add any errors from the parser
                    item.errors.forEach(error=>{
                        errors.push(`Parser error: ${this.info.lineNum}: ${error}`)
                    })
                }
            })
        }
        else{
            errors.push(`Error content for this node is empty`)
        }
        return errors.length==0
    }

    GetAllChoices()
    {
        let all_property_choices = {}
        this.GetPropertyNames().forEach(name=>{
            all_property_choices[name] = this.GetPropertyChoices(name)
        })
        return all_property_choices
    }

    /** First-seen group label per property name (full tree scan). */
    CollectPropertyGroups(groups = {}, order = [])
    {
        const record = (info) => {
            if (!info || !info.isProperty || !info.property_name) return
            if (!(info.property_name in groups)) {
                groups[info.property_name] = info.property_group || null
                const g = info.property_group
                if (g && !order.includes(g)) order.push(g)
            }
        }
        this.forEach((node) => record(node.info))
        return { propertyGroups: groups, propertyGroupOrder: order }
    }

    GetSalesSelections()
    {
        let all_property_sales_selections = []
        this.GetPropertyNames().forEach(name=>{
            let newones = this.GetPropertySalesSelections(name);
            all_property_sales_selections = all_property_sales_selections.concat( newones.filter( i2 => !all_property_sales_selections.find( i1 => i1 == i2 ) ) );            
        })
        return all_property_sales_selections
    }

    NodeGraph(allNodes, padding, stat_data)  // outputs a node graph string 
    {        
        let str = padding?"":"[root]\n"
        padding = padding??"   "

        //console.log(stat_data)

        this.content.forEach(item=>{
            if (item.isNode) {
                let info = item.info
                if (info.isProperty) {
                    let s = `${info.property_name}:${info.property_value}`
                    let opts = this.GetPropertyOptions(info.property_name, info.property_value)
                    if (item.enabled || allNodes){
                        let stat = ""
                        if (stat_data) {
                            if (stat_data[info.property_name] && stat_data[info.property_name][info.property_value]) {
                                //stat = stat_data[info.property_name][info.property_value]+"%"                            
                                stat = FormatPercent(stat_data[info.property_name][info.property_value])
                                //try{
                                //}
                                //catch (err){
                                //    console.log(info.property_name)
                                //    console.log(info.property_value)
                                //    console.log(stat_data[info.property_name])
                                //    console.log("*** [ERROR]",err)
                                //}
                            }
                            else{
                                stat = FormatPercent(0)
                            }
                        }
                        if (allNodes) {
                            let enable_txt = item.enabled ? "[X]":"[ ]"
                            str += stat+padding + `${enable_txt} <${s}> prob:${opts.prob} depth:${item.depth}\n`
                        }else{
                            str += stat+padding + `<${s}> prob:${opts.prob} depth:${item.depth}\n`
                        }
                        str += item.NodeGraph(allNodes, padding+"    ", stat_data)
                    }
                }
            }
        })
        return str
    }

    GetStats(samples=10000, master_seed=10, stat_data={}, onProgress=null) 
    {
        // Generate percentage chance info for each property types
        // It does this brute force by generating thousands of combos 
        // then outputs the percentage results for each property

        let code = this.Export()   // Export all current code 
        let root = new PM_Node(code)  // Create a new temp node structure 

        let rng = new PM_RNG(master_seed);rng.r()

        // all errors collected 
        let all_errors = []

        const statsResult = (node_graph, extra = {}) => ({
            node_graph,
            stat_data,
            samples,
            master_seed,
            valid: all_errors.length === 0,
            error_count: all_errors.length,
            errors: all_errors.slice(0, 100),
            ...extra,
        });

        // do an initial validity test 
        let valid = root.IsValid(all_errors)
        if (!valid) {
            // early return if the structure is invalid
            const msg = "GetStat failed because the structure is not valid\n" + all_errors.join("\n");
            return statsResult(msg, { structure_valid: false });
        }

        // counters for all instances of properties
        let select_counter = {
            //type: {person: 3,dog: 3,cat: 4}
        }
        
        // batch generate loop 
        for(let n=0; n<samples; n++){
            let transactionId = GenerateHash(rng,64)
            let seed = HashToSeed(transactionId)

            // generate the random properties from the seed
            root.SetRandomProperties(seed, {})

            let errors = []
            let valid = root.IsValid(errors)
            let properties = root.GetProperties()

            //console.log(properties)

            // add the property choices to the counter object
            ForEachPair(properties, (key, value)=>{
                select_counter[key] = select_counter[key] ?? {}
                select_counter[key][value] = select_counter[key][value] ?? 0
                select_counter[key][value]++
            })

            // if there are errors add them to the errors list
            if (!valid) {
                errors.forEach(txt=>{                    
                    all_errors.push(`#${n} seed:${seed} `+txt) 
                })
            } 
            
            // log to the console after every 1000 tests
            if (!(n % 1000)) {
                const percent = Math.round((n / samples) * 100);
                console.log("Processed: " + percent + "%  " + n + " of " + samples + " samples  ");
                if (typeof onProgress === "function") {
                    onProgress({ n, samples, percent });
                }
            }
            
            //console.log(`GRAPH #${n} seed:${seed} valid:${valid}`+ root.nodeGraph(true))

            // reset the node graph ready for another clean run 
            root.ResetAll()
        }    
        
        // print all errors if they exist 
        if (all_errors.length>0) {
            let error_str = ""
            all_errors.forEach(txt=>error_str += txt+"\n")
            console.log("[ERRORS]\n", error_str)
        }

        console.log(select_counter)
        let global_results = {}
        ForEachPair(select_counter, (name,counters)=>{
            let remainder = 100
            ForEachPair(counters, (value,qty)=>{
                let str = `<${name}:${value}>`
                let percent = (qty/samples)*100
                stat_data[name] = stat_data[name] ?? {}
                stat_data[name][value] = percent
                global_results[str] = percent.toFixed(2)+"%"
                remainder -= percent
            })
            if (Math.abs(remainder)>0.01)
                global_results[`<${name}:not present>`] = remainder.toFixed(2)+"%" 
        })

        //return JSON.stringify(global_results,null,2).replaceAll('"',"")
        
        let str = ""
        str += "   Generated "+samples+" random property samples \n"
        str += "   Master seed used "+master_seed+" \n"        
        if (all_errors.length>0) {
            str += `   Structure has ${all_errors.length} errors.`
        }else{
            str += "   Structure is valid.  No errors detected."
        }

        const node_graph = " %Chance " + root.NodeGraph(false, null, stat_data) + str;
        return statsResult(node_graph, { structure_valid: true });
    }

    /**
     * Like GetStats but yields to the event loop so UI/WebSocket progress can update.
     * Used by PropertyAnalysis — see docs/PROPERTY-ANALYSIS.md.
     */
    async GetStatsAsync(samples=10000, master_seed=10, stat_data={}, onProgress=null)
    {
        let code = this.Export()
        let root = new PM_Node(code)

        let rng = new PM_RNG(master_seed);rng.r()

        let all_errors = []

        const statsResult = (node_graph, extra = {}) => ({
            node_graph,
            stat_data,
            samples,
            master_seed,
            valid: all_errors.length === 0,
            error_count: all_errors.length,
            errors: all_errors.slice(0, 100),
            ...extra,
        });

        let valid = root.IsValid(all_errors)
        if (!valid) {
            const msg = "GetStat failed because the structure is not valid\n" + all_errors.join("\n");
            return statsResult(msg, { structure_valid: false });
        }

        let select_counter = {}
        const progressEvery = Math.max(25, Math.min(500, Math.floor(samples / 40)));

        for(let n=0; n<samples; n++){
            let transactionId = GenerateHash(rng,64)
            let seed = HashToSeed(transactionId)

            root.SetRandomProperties(seed, {})

            let errors = []
            let valid = root.IsValid(errors)
            let properties = root.GetProperties()

            ForEachPair(properties, (key, value)=>{
                select_counter[key] = select_counter[key] ?? {}
                select_counter[key][value] = select_counter[key][value] ?? 0
                select_counter[key][value]++
            })

            if (!valid) {
                errors.forEach(txt=>{
                    all_errors.push(`#${n} seed:${seed} `+txt)
                })
            }

            const reportNow = n % progressEvery === 0 || n === samples - 1;
            if (reportNow) {
                const percent = samples > 0 ? Math.round((n / samples) * 100) : 100;
                console.log("Processed: " + percent + "%  " + n + " of " + samples + " samples  ");
                if (typeof onProgress === "function") {
                    onProgress({ n, samples, percent });
                    await new Promise((resolve) => setImmediate(resolve));
                }
            }

            root.ResetAll()
        }

        if (typeof onProgress === "function") {
            onProgress({ n: samples, samples, percent: 100 });
            await new Promise((resolve) => setImmediate(resolve));
        }

        if (all_errors.length>0) {
            let error_str = ""
            all_errors.forEach(txt=>error_str += txt+"\n")
            console.log("[ERRORS]\n", error_str)
        }

        console.log(select_counter)
        ForEachPair(select_counter, (name,counters)=>{
            let remainder = 100
            ForEachPair(counters, (value,qty)=>{
                let percent = (qty/samples)*100
                stat_data[name] = stat_data[name] ?? {}
                stat_data[name][value] = percent
                remainder -= percent
            })
        })

        let str = ""
        str += "   Generated "+samples+" random property samples \n"
        str += "   Master seed used "+master_seed+" \n"
        if (all_errors.length>0) {
            str += `   Structure has ${all_errors.length} errors.`
        }else{
            str += "   Structure is valid.  No errors detected."
        }

        const node_graph = " %Chance " + root.NodeGraph(false, null, stat_data) + str;
        return statsResult(node_graph, { structure_valid: true });
    }

    HashToSeed(hash)
    {
        return HashToSeed(hash)
    }
    /*
    GetValidPropertyChoices()
    {
        // Based on the current property selections
        // these are the possible choices

        let choices = {}
        
        Object.getOwnPropertyNames(this.GetProperties())
            .forEach(name=>{
                choices[name] = this.GetPropertyChoices(name)
            })

        return choices
    }
    */
    /*
    GetPropertyChoices2(name, choices={})  // TODO: Remove
    {
        this.content.forEach(item=>{
            if (item.isNode){
                let info = item.info
                if (info.isProperty) {                    
                    
                    if (info.property_name == name) {
                        // since more than one of the same property 
                        // value can exist. We merge the json options.
                        // Later options take priority of early ones
                        
                        let value = info.property_value
                        let existing_opts = choices[value] ?? {}
                        let options = {
                            ...existing_opts,
                            ...info.property_options,
                        }
                        choices[value] = options
                    }
                }
                if (item.enabled) {
                    // go deeper into enabled nodes!
                    item.GetPropertyChoices(name, choices)
                }
            } 
        })
        return choices 
    }
    */

    /*
    isValid()
        - returns true if all is good
    getErrors()
        - returns error structure
    getBlocks(name)
        - returns a list of 
    setCodeBlock(name,code)
        - replace and reparse the code block node
    getProperties()
        - gets all properties for this node + children
    setProperty(name,value)
        - sets this property as active
        - enables / disables nodes
    */
}

class PM_RNG 
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

function djb2Hash(str) 
{
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return hash >>> 0; // Ensure the result is a positive integer
}
  
function HashToSeed(hash) 
{
    const hashValue = djb2Hash(hash);
    const maxSeed = 8999999; // Maximum 8-digit number
    return hashValue % (maxSeed + 1);
}

function GenerateHash(RN, numDigits) 
{
    let choices = "123456789abcdef"
    let hash = ""
    for(let n=0;n<numDigits;n++) {
        hash += RN.item(choices)
    }
    return hash
}

let ForEachPair = (object,fn)=>{
    for (const [key, value] of Object.entries(object)) 
        fn(key,value)
}

function FormatPercent(number, numPadding=7) {
    let formatted = number.toFixed(2);
    let spacesToAdd = numPadding - formatted.length;  
    return ' '.repeat(spacesToAdd) + formatted + '%';
  }

function WeightedRandom(RN, array)//[ [weight,item], [1, <item>], etc.. ]
{
    let maxWeight = 0
    array.forEach(item=>maxWeight+=item[0])
    let value = RN.f(0, maxWeight)
    let current
    for(let n=0; n<array.length; n++) {
        let weight = array[n][0]
        current = n
        if (value >= weight) {
            value -= weight
        }   
        else{
            break;
        }
    }
    //console.log(`MaxWeight:${maxWeight} numItems:${array.length} value:${intialVal} selected:${current}`)
    let result = array[current] 
    return result 
}

try{
	module.exports = {
		Node:           PM_Node,
        RNG:            PM_RNG,
		ParseLine:      ParseLine,
        WeightedRandom: WeightedRandom,
        HashToSeed:     HashToSeed,
        GenerateHash:   GenerateHash,
        PROPERTY_GROUP_FLAGS,
        buildPropertyGroupFlags,
	}	
}catch (error) {
	//website doesn't understand exports, just swallow the error
}
