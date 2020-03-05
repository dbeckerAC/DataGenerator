let csv = require('csv-parser');
let fs = require("fs");
let coder = require("./Coder.js");

// parameters, TODO: parameters
var folder = "Agentmodel";
var install = "../../src";
var input = "Agentmodel.json";
var fieldsFile = "Agentmodel.csv";

var types = {};
var enums = {};

// get content
var content = fs.readFile(folder + "/" + input, (err, content) => {

    var jsonContent = JSON.parse(content);

    fs.createReadStream(folder + "/" + fieldsFile)
        .pipe(csv())
        .on('data', (row) => {

            // check if struct exists
            if(jsonContent.types[row.struct] !== undefined) {

                // create fields object
                if(jsonContent.types[row.struct].fields === undefined)
                    jsonContent.types[row.struct].fields = {};

                // add field
                jsonContent.types[row.struct].fields[row.name] = row;

            }

        })
        .on('end', () => {


            generateCode(jsonContent);

        });


});


var generateCode = function(jsonContent) {

    // get license text
    fs.readFile(folder + "/" + jsonContent.license, "utf8", function (err, license) {

        var H = new coder.Coder('', '', 0); // header file
        var B = new coder.Coder('', '', 0); // cpp file
        var WH = new coder.Coder('', '', 0); // header file for wrapper

        // license
        license = license.replace("<YEAR>", jsonContent.year);
        license = license.replace("<COPYRIGHT_HOLDER>", jsonContent.copyright);
        license = "/*\n * " + license.split("\n").join("\n * ");

        // create body
        let bodyFileName = `${jsonContent.name}${jsonContent.wrapper.file_addition}.cpp`;
        bodyLic = license.replace("<FILENAME>", bodyFileName);
        B.addBlock(bodyLic, ` */`, false);

        // create header
        let headerFileName = jsonContent.name + ".h";
        headerLic = license.replace("<FILENAME>", headerFileName);
        H.addBlock(headerLic, ` */`, false);

        // header directive
        let sw = (jsonContent.include_guard ? jsonContent.include_guard : jsonContent.name.toUpperCase() + "_H");
        let header = H.addBlock(`#ifndef ${sw}\n#define ${sw}`, `#endif // ${sw}`, false);

        // add includes
        header
            .addBlock("", "", false)
            .addLine("#include <iostream>")
            // .addLine("#include "GenericContainer.h")
            .addLine(`#include "Injection.h"`);

        // namespace
        let nspace = header.addBlock(`namespace ${jsonContent.namespace} {`, `} // namespace`, true);

        // iterate over constants
        let constants = nspace.addBlock('', '', false);
        for (let i = 0; i < jsonContent.constants.length; ++i)
            generateContant(constants, jsonContent.constants[i]);


        // create header
        let headerWrapperFileName = `${jsonContent.name}${jsonContent.wrapper.file_addition}.h`;
        headerLic = license.replace("<FILENAME>", headerFileName);
        WH.addBlock(headerLic, ` */`, false);

        // header directive
        sw = jsonContent.wrapper.include_guard;
        let wrHeader = WH.addBlock(`#ifndef ${sw}\n#define ${sw}`, `#endif // ${sw}`, false);

        // add includes
        wrHeader
            .addBlock("", "", false)
            .addLine("#include <iostream>")
            .addLine(`#include "${headerFileName}"`)
            .addLine(`#include ${jsonContent.wrapper.include}`);

        // namespace
        let wrNspace = wrHeader.addBlock(`namespace ${jsonContent.namespace} {`, `} // namespace`, true);


        // add includes
        // B.addLine("#include <exception>");
        B.addLine(`#include "${headerWrapperFileName}"`);


        // create blocks for enums and types
        let enumsDef = nspace.addBlock('', '', false);
        let typesDef = nspace.addBlock('', '', false);
        let wrTypesDef = wrNspace.addBlock('', '', false);
        let funcsDef = wrNspace.addBlock('', '', false);
        let fncs = nspace.addBlock('', '', false);
        let ops = header.addBlock('', '', false);

        // get all keys
        let keys = Object.keys(jsonContent.types);

        // create index
        for (let i = 0; i < keys.length; ++i) {

            // get type
            let type = jsonContent.types[keys[i]];

            // switch
            if (type.type === "struct")
                types[keys[i]] = type;
            else if (type.type === "enum")
                enums[keys[i]] = type;
        }

        // parse elements
        for (let i = 0; i < keys.length; ++i) {

            // get type
            let type = jsonContent.types[keys[i]];

            // switch
            if (type.type === "struct") {
                generateStruct(typesDef, null, null, type, jsonContent.namespace);
                // generateStruct(typesDef, fncs, ops, type, jsonContent.namespace);
                // generateStructFunctions(B, type, jsonContent.namespace);
            } else if (type.type === "enum") {
                generateEnum(enumsDef, null, null, type, jsonContent.namespace);
                // generateEnum(enumsDef, fncs, ops, type, jsonContent.namespace);
                // generateEnumFunctions(B, type, jsonContent.namespace);
            }

        }

        // parse elements for injection
        for (let i = 0; i < keys.length; ++i) {

            // get type
            let type = jsonContent.types[keys[i]];

            // switch
            if (type.type === "struct")
                generateStruct(wrTypesDef, null, null, type, jsonContent.namespace, 'Injection');

        }

        // generate injection code
        for (let i = 0; i < jsonContent.tree.length; ++i) {

            // get type
            let type = types[jsonContent.tree[i]];

            // generate code
            generateTree(funcsDef, B, type, jsonContent.namespace);

        }

        fs.writeFile(install + "/" + headerFileName, H.generateCode(""), () => {
            console.log("File written: " + headerFileName)
        });

        fs.writeFile(install + "/" + bodyFileName, B.generateCode(""), () => {
            console.log("File written: " + bodyFileName)
        });

        fs.writeFile(install + "/" + headerWrapperFileName, WH.generateCode(""), () => {
            console.log("File written: " + headerWrapperFileName)
        });

    });

};


var generateTree = function(funcsDef, func, type, namespace) {

    // add function header
    funcsDef.addLine(`void registerTree(__${type.name} *tree, ${type.name} *data);`);

    // generate function body
    let body = func.addBlock(`void ${namespace}::registerTree(__${type.name} *tree, ${type.name} *data) {`, '}', true);
    body.addLine(`tree->registerValue(data, data);`);

    // recursively add children
    generateSubTree(body, type, '', namespace)

};

var generateSubTree = function(body, type, level, namespace) {

    let keys = Object.keys(type.fields);
    for(let i = 0; i < keys.length; ++i) {

        // get type
        let key = type.fields[keys[i]].type;
        let tp = types[key];

        // get sizes
        let size = type.fields[keys[i]].size.split(/\s*,\s*/);
        if(!size[0])
            size = [];

        // get block
        let block = body;
        let dot = level ? '.' : '->';
        let nLevel = `${level}${dot}${keys[i]}`;

        // iterate over sizes
        for(let j = 0; j < size.length; ++j) {

            // for loop
            let lev = `i${j}`;
            block = block.addBlock(`for(unsigned long ${lev} = 0; ${lev} < ${size[j]}; ++${lev}) {`, `}`, true);

            // add array
            nLevel += `[${lev}]`;

        }

        // add register command
        block.addLine(`tree${nLevel}.registerValue(&data${nLevel}, data);`);

        // generate sub tree only for complex types
        if(tp !== undefined)
            generateSubTree(block, tp, nLevel, namespace);

    }

};


var generateContant = function(file, type) {

    let unit = type.unit ? ` (in *${type.unit}*)` : '';
    file.addLine(`static const ${type.type} ${type.name} = ${type.value}; //!< ${type.description}${unit}`);

};


var generateEnum = function(headerDef, headerInt, headerExt, type, namespace) {

    let name = type.name;
    let fields = type.list.join(", ");

    // add content to header
    if(headerExt)
        headerExt.addLine(`std::ostream& operator<< (std::ostream &os, ${namespace}::${name} obj);`);

    if(headerInt)
        headerInt.addLine(`void parse(${name} &obj, const std::string &value);`);

    headerDef.addLine(`enum ${name} {${fields}};`);

};

var generateStruct = function(headerDef, headerInt, headerExt, type, namespace, wrapper = null) {

    // create class name
    let name = wrapper ? `__${type.name}` : type.name;
    let parent = wrapper ? ` : public ${wrapper}<${type.name}>` : '';

    // add content to header
    if(headerInt)
        headerExt.addLine(`std::ostream& operator<< (std::ostream &os, ${namespace}::${name} obj);`);

    if(headerExt)
        headerInt.addLine(`void parse(${name} &obj, const GenericContainer &cont);`);

    // add type block
    let body = headerDef.addBlock(`struct ${name}${parent} {`, `};`, true);

    // add operator
    if(wrapper)
        body.addLine(`using ${wrapper}<${type.name}>::operator =;`);

    // generate fields
    let keys = Object.keys(type.fields);
    for(let i = 0; i < keys.length; ++i) {

        // get key and field
        let key = keys[i];
        let field = type.fields[key];

        // check if base type
        let complex = types[field.type] !== undefined;

        // get type string
        let dtype = field.type;
        if (complex)
            dtype = types[field.type].name;
        else if(enums[field.type] !== undefined)
            dtype = enums[field.type].name;
        else if (field.type === "string")
            dtype = "std::string";

        // add wrapper
        if(wrapper && !complex)
            dtype = `${wrapper}<${dtype}>`;
        else if(wrapper)
            dtype = `__${dtype}`;

        // generate comment
        let comment = field.description + (field.unit ? " (in *" + field.unit + "*)" : " (no unit)");
        let size = field.size ? '[' + field.size.split(/\s*,\s*/).join('][') + ']' : '';

        // add line
        body.addLine(`${dtype} ${key}${size}; //!< ${comment}`, true);

    }


};


var generateEnumFunctions = function(body, type, namespace) {

    // add content to body for operators
    let op = body.addBlock(`std::ostream& operator<< (std::ostream &os, ${namespace}::${type.name} obj) {`, `}`, true)
    let sw = op.addBlock(`switch(obj) {`, `}`);

    // add content to body for functions
    let fnc = body.addBlock(`void ${namespace}::parse(${type.name} &obj, const std::string &value) {`, `}`, true);

    // generate fields
    let keys = Object.keys(type.list);
    for(let i = 0; i < keys.length; ++i) {

        // get key and field
        let key = keys[i];
        let field = type.list[key];

        // add case
        sw.addLine(`case ${namespace}::${field}:`);
        sw.addLine(`\tos << "${field}";`);
        sw.addLine(`\tbreak;`);

        let els = i === 0 ? '' : 'else ';
        fnc.addLine(`${els}if(value == "${field}")`);
        fnc.addLine(`\tobj = ${field};`);

    }

    // return stream
    op.addLine(`return os;`);

};


var generateStructFunctions = function(body, type, namespace) {

    // add content to body for operators
    let op = body.addBlock(`std::ostream& operator<< (std::ostream &os, ${namespace}::${type.name} obj) {`, `}`, true);
    op.addLine(`os << "{"`);

    // add content to body for functions
    let fnc = body.addBlock(`void ${namespace}::parse(${type.name} &obj, const GenericContainer &cont) {`, `}`, true);

    // generate fields
    let keys = Object.keys(type.fields);
    for(let i = 0; i < keys.length; ++i) {

        // get key and field
        let key = keys[i];
        let field = type.fields[key];
        let sep = i === 0 ? "" : ",";

        // add case
        if(field.type === "string") {
            op.addLine(`\t<< "${sep}\\"${key}\\" : \\"" << obj.${key} << "\\""`);
        } else
            op.addLine(`\t<< "${sep}\\"${key}\\" : " << obj.${key}`);


        // get type
        let tp = (field.type === "string" ? "std::string" : field.type);
        let size = field.size ? '*' : '';

        // parsing
        if(types[field.type] !== undefined)
            fnc.addLine(`parse(obj.${key}, cont["${key}"]);`);
        else if(enums[field.type] !== undefined)
            fnc.addLine(`parse(obj.${key}, cont.get<std::string>("${key}"));`);
        else
            fnc.addLine(`obj.${key} = cont.get<${tp}>("${key}");`);

    }

    // add end of object
    op.addLine(`\t<< "}";`);
    op.addLine(`\treturn os;`);

};




