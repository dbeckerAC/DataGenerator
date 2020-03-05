let fs = require("fs");

// parameters
var folder = "Agentmodel";
var input = "Agentmodel.json";

// get content
var content = fs.readFileSync(folder + "/" + input);
var jsonContent = JSON.parse(content);

// global
var types = {};

// get license text
fs.readFile("license_mit.txt", "utf8", function(err, license) {

    // license
    license =  license.replace("<YEAR>", jsonContent.year);
    license =  license.replace("<COPYRIGHT_HOLDER>", jsonContent.copyright);
    license =  "/*\n * " + license.split("\n").join("\n * ") + "\n";
    license += " *\n * generated by DataGenerator https://github.com/jensklimke/DataGenerator\n";

    let headerCont = license;
    let bodyCont = license;

    // add file name
    headerCont += " *\n * " + jsonContent.name + ".h\n */\n\n";

    // add header switch
    let sw = jsonContent.name.toUpperCase() + "_H";
    headerCont += `#ifndef ${sw}\n#define ${sw}\n\n\n`;

    // add includes
    headerCont += "#include <iostream>\n";
    headerCont += "\n\n";

    // add namespace
    headerCont += jsonContent.namespace ? "namespace " + jsonContent.namespace + " {\n\n" : "";

    // add name and includes for body
    bodyCont += " *\n * " + jsonContent.name + ".cpp\n */\n";
    bodyCont += "\n#include <exception>";
    bodyCont += "\n#include \"" + jsonContent.name + ".h\"";
    bodyCont += "\n\n";

    // save types
    types = jsonContent.types;

    // initialize values
    let serHeader = "";
    let deserHeader = "";
    let deserBody = "";

    // iterate over constants
    for(let i = 0; i < jsonContent.constants.length; ++i) {

        let cont = generateContant(jsonContent.constants[i]);

        headerCont += cont.class;
        serHeader += cont.serializeHeader;
        deserHeader += cont.deserializeHeader;
        bodyCont += cont.serializeBody;
        deserBody += cont.deserializeBody;

    }

    headerCont += "\n\n";

    // iterate over types
    let keys = Object.keys(jsonContent.types);
    for(let i = 0; i < keys.length; ++i) {

        let type = jsonContent.types[keys[i]];

        let cont = {};
        if(type.type === "undefined" || type.type === "struct")
            cont = generateStruct(type);
        else if(type.type === "enum")
            cont = generateEnum(type);

        headerCont += cont.class;
        serHeader += cont.serializeHeader;
        deserHeader += cont.deserializeHeader;
        bodyCont += cont.serializeBody;
        deserBody += cont.deserializeBody;

    }

    // generate content
    let cont = generateStruct(jsonContent);
    headerCont += cont.class;
    headerCont += cont.serializeHeader;
    headerCont += serHeader;
    headerCont += cont.deserializeHeader;
    headerCont += deserHeader;
    headerCont += jsonContent.namespace ? "} // namespace\n\n" : "";
    headerCont += `\n\n#endif // ${sw}`;

    // add serialization
    bodyCont += cont.serializeBody;
    bodyCont += deserBody;
    bodyCont += cont.deserializeBody;

    var headerFilename = folder + "/" + jsonContent.name + ".h";
    fs.writeFile(headerFilename, headerCont, () => {
        console.log("File written: " + headerFilename)
    });

    filename = folder + "/" + jsonContent.name + ".cpp";
    fs.writeFile(filename, bodyCont, () => {
        console.log("File written: " + filename)
    });

});


var generateStruct = function(type) {

    let name = type.name;

    let serHeader = `std::ostream& operator<< (std::ostream &os, const ${name} &obj);\n`;
    let serBody = `std::ostream& operator<< (std::ostream &os, const ${name} &obj) {\n\tos << "{"`;
    let deserHeader = `void setField(${name} &obj, const std::string &field, const std::string &value);\n`;
    let deserBody = `void setField(${name} &obj, const std::string &field, const std::string &value) {\n\n`;

    // add description
    let str = "";
    if(type.description !== undefined)
        str += "/*! \\brief " + type.description.split("\n").join("\n * ") + "\n */\n";

    // create struct
    str += `struct ${name} {\n`;

    // a counter
    let j = 0;

    // generate fields
    let keys = Object.keys(type.fields);
    for(let i = 0; i < keys.length; ++i) {

        let k = keys[i];
        let field = type.fields[k];

        // get type string
        let dtype = field.type;
        if(types[field.type] !== undefined)
            dtype = types[field.type].name;
        else if(field.type === "string")
            dtype = "std::string";

        // generate line
        str += "\t" + dtype + " " + k + "; //!< " + field.description
            + (field.unit !== undefined ? " (in *" + field.unit + "*)" : "") + "\n";

        let sep = i === 0 ? "" : ",";
        let nl = "\n\t\t";

        // serialization body
        if(field.type === "string")
            serBody += `${nl} << R"(${sep}"${k}":")" << obj.${k} << "\\""`;
        else
            serBody += `${nl} << R"(${sep}"${k}":)" << obj.${k}`;

        // deserialization body
        let els = j === 0 ? "" : "else ";

        // create parser
        let parse = "value";
        if(field.type === "double")
            parse = `std::stod(value)`;
        else if(field.type === "int")
            parse = `std::stoi(value)`;
        else if(types[field.type] !== undefined)
            parse = null;

        if(parse != null) {
            deserBody += `\t${els}if(field == "${k}")\n\t\tobj.${k} = ${parse};\n`;
            j++;
        }

    }

    // str += "\n\t/** Exports the class structure.\n\t * @return A vector of fields\n\t */\n\tstd::vector<Generator::Field> getFields() const;\n\n";
    // str += "\n\t/** Sets a field of the class.\n\t * @param field Field name\n\t * @param value Value to be set\n\t */\n\tvoid setField(std::string field, std::string value);\n\n";
    str += "};\n\n\n";
    serBody += " << \"}\";\n\treturn os;\n}\n\n\n";
    deserBody += "\telse\n\t\tthrow std::invalid_argument(\"Cannot set desired field.\");\n\n}\n\n\n";

    return {
        "class": str,
        "serializeHeader": serHeader,
        "serializeBody": serBody,
        "deserializeHeader": deserHeader,
        "deserializeBody": deserBody
    };

};


var generateEnum = function(type) {

    let name = type.name;

    let serHeader = `std::ostream& operator<< (std::ostream &os, ${name} obj);\n`;
    let serBody = `std::ostream& operator<< (std::ostream &os, ${name} obj) {\n\tswitch(obj) {\n`;
    let deserHeader = `void setValue(${name} &obj, const std::string &value);\n`;
    let deserBody = `void setValue(${name} &obj, const std::string &value) {\n\n`;

    // add description
    let str = "";
    if(type.description !== undefined)
        str += "/*! \\brief " + type.description.split("\n").join("\n * ") + "\n */\n";

    // create struct
    str += `enum ${name} {`;

    // generate fields
    for(let i = 0; i < type.list.length; ++i) {

        let field = type.list[i];

        // generate line
        str += (i === 0 ? "" : ", ") + field;

        // serialization body
        serBody += `\t\tcase ${field}:\n\t\t\tos << "${field}";\n\t\t\tbreak;\n`;

        // deserialization body
        let els = i === 0 ? "" : "else ";

        // create parser
        deserBody += `\t${els}if(value == "${field}")\n\t\tobj = ${field};\n`;

    }

    // str += "\n\t/** Exports the class structure.\n\t * @return A vector of fields\n\t */\n\tstd::vector<Generator::Field> getFields() const;\n\n";
    // str += "\n\t/** Sets a field of the class.\n\t * @param field Field name\n\t * @param value Value to be set\n\t */\n\tvoid setField(std::string field, std::string value);\n\n";
    str += "};\n\n\n";
    serBody += "\t}\n\treturn os;\n}\n\n\n";
    deserBody += "\n\n}\n\n\n";

    return {
        "class": str,
        "serializeHeader": serHeader,
        "serializeBody": serBody,
        "deserializeHeader": deserHeader,
        "deserializeBody": deserBody
    };

};


var generateContant = function(type) {

    let unit = type.unit ? ` (in *${type.unit}*)` : '';

    return {
        "class": `static const ${type.type} ${type.name} = ${type.value}; //!< ${type.description}${unit}\n`,
        "serializeHeader": '',
        "serializeBody": '',
        "deserializeHeader": '',
        "deserializeBody": '',
    };

};

